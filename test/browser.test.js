"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
const events = require("node:events");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const webpack = require("webpack");

const package_root = path.resolve(__dirname, "..");

function chrome() {
  return [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(fs.existsSync);
}

function mustRun(command, args, options = {}) {
  const env = { ...process.env, ...(options.env || {}) };
  delete env.NODE_TEST_CONTEXT;
  const result = child_process.spawnSync(command, args, { cwd: options.cwd || package_root, encoding: "utf8", env });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function packedConsumer(work) {
  const artifacts = path.join(work, "artifacts");
  const consumer = path.join(work, "consumer");
  const cache = path.join(work, "npm-cache");
  fs.mkdirSync(artifacts, { recursive: true });
  fs.mkdirSync(consumer, { recursive: true });
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "window-manager-browser-consumer", private: true }));
  const runtime_root = path.dirname(require.resolve("@drumee/ui-runtime/package.json"));
  mustRun("npm", ["pack", "--ignore-scripts", "--pack-destination", artifacts], { cwd: runtime_root, env: { NPM_CONFIG_CACHE: cache } });
  mustRun("npm", ["pack", "--ignore-scripts", "--pack-destination", artifacts], { env: { NPM_CONFIG_CACHE: cache } });
  const archives = fs.readdirSync(artifacts).filter((name) => name.endsWith(".tgz")).map((name) => path.join(artifacts, name));
  assert.equal(archives.length, 2);
  mustRun("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...archives], {
    cwd: consumer,
    env: { NPM_CONFIG_CACHE: cache, NODE_PATH: "" }
  });
  const consumer_require = createRequire(path.join(consumer, "package.json"));
  for (const specifier of [
    "@drumee/ui-runtime",
    "@drumee/window-manager",
    "@drumee/window-manager/browser",
    "@drumee/window-manager/skin.css",
    "@drumee/window-manager/package.json"
  ]) {
    assert.ok(consumer_require.resolve(specifier).startsWith(path.join(consumer, "node_modules") + path.sep), specifier);
  }
  return consumer;
}

function compile(output_path, consumer) {
  return new Promise((resolve, reject) => webpack({
    mode: "development",
    devtool: false,
    context: consumer,
    entry: path.join(package_root, "test/fixtures/browser-entry.js"),
    output: { path: output_path, filename: "window-manager.js" },
    resolve: { modules: [path.join(consumer, "node_modules")] },
    module: { rules: [{ test: /\.css$/, use: [require.resolve("style-loader"), require.resolve("css-loader")] }] }
  }, (error, stats) => {
    if (error) return reject(error);
    if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
    resolve();
  }));
}

async function endpoint(profile, child, diagnostics) {
  const port_file = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 300; attempt++) {
    if (child.exitCode != null || child.signalCode != null) {
      throw new Error(`Chromium exited before DevTools became ready (${child.exitCode || child.signalCode})\n${diagnostics.join("")}`);
    }
    try {
      const port = Number(fs.readFileSync(port_file, "utf8").split(/\r?\n/, 1)[0]);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return (await response.json()).find((entry) => entry.type === "page");
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome DevTools endpoint did not become ready\n${diagnostics.join("")}`);
}

function devtools(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let serial = 0;
    const pending = new Map();
    socket.addEventListener("open", () => resolve({
      close: () => socket.close(),
      send(method, params = {}) {
        const id = ++serial;
        socket.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve_command, reject_command) => pending.set(id, { resolve_command, reject_command }));
      }
    }));
    socket.addEventListener("error", () => reject(new Error("Chrome DevTools connection failed")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.error) call.reject_command(new Error(message.error.message));
      else call.resolve_command(message.result);
    });
  });
}

async function evaluate(protocol, expression) {
  const response = await protocol.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

async function point(protocol, selector, dx = 0, dy = 0) {
  return evaluate(protocol, `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2+${dx},y:r.top+r.height/2+${dy}}})()`);
}

async function drag(protocol, from, to, steps = 8) {
  await protocol.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...from });
  await protocol.send("Input.dispatchMouseEvent", { type: "mousePressed", ...from, button: "left", buttons: 1, clickCount: 1 });
  for (let step = 1; step <= steps; step++) {
    await protocol.send("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: from.x + (to.x - from.x) * step / steps,
      y: from.y + (to.y - from.y) * step / steps, button: "left", buttons: 1
    });
  }
  await protocol.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function terminate(child) {
  const groupAlive = () => {
    try { process.kill(-child.pid, 0); return true; } catch (_) { return false; }
  };
  const signalGroup = (signal) => {
    try { process.kill(-child.pid, signal); } catch (_) {
      if (child.exitCode == null && child.signalCode == null) child.kill(signal);
    }
  };
  const exited = child.exitCode == null && child.signalCode == null ? events.once(child, "exit") : Promise.resolve();
  signalGroup("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (groupAlive()) signalGroup("SIGKILL");
  for (let attempt = 0; attempt < 100 && groupAlive(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (groupAlive()) throw new Error("Chromium process group did not terminate");
}

test("real browser provides independent multi-window drag, resize, generic drop and cleanup", { timeout: 90000 }, async (context) => {
  if (!chrome()) return context.skip("Chromium is required");
  const output_path = fs.mkdtempSync(path.join(os.tmpdir(), "drumee-window-manager-"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "drumee-window-manager-profile-"));
  const consumer_work = fs.mkdtempSync(path.join(os.tmpdir(), "drumee-window-manager-consumer-"));
  const consumer = packedConsumer(consumer_work);
  await compile(output_path, consumer);
  fs.writeFileSync(path.join(output_path, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#workspace{width:1000px;height:700px;background:#eef2f7}#workspace-two{position:absolute;left:1050px;top:0;width:100px;height:100px}#state-engine{position:absolute;left:1050px;top:120px}#token{position:absolute;left:20px;top:640px;width:52px;height:32px;background:#ef4444;z-index:9999}</style></head><body><main id="workspace"></main><aside id="workspace-two"></aside><aside id="state-engine"></aside><div id="token" class="generic-token">token</div><script>window.onerror=(m,s,l,c,e)=>document.body.dataset.error=String(e&&(e.stack||e.message)||m)</script><script src="window-manager.js"></script></body></html>`);
  const diagnostics = [];
  const process = child_process.spawn(chrome(), [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--window-size=1200,800",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"
  ], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  process.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));
  let protocol;
  let primary_error;
  try {
    const page = await endpoint(profile, process, diagnostics);
    protocol = await devtools(page.webSocketDebuggerUrl);
    await protocol.send("Page.enable");
    await protocol.send("Runtime.enable");
    await protocol.send("Page.navigate", { url: `file://${path.join(output_path, "index.html")}` });
    for (let attempt = 0; attempt < 80; attempt++) {
      const state = await evaluate(protocol, "({ready:document.body.dataset.ready,error:document.body.dataset.error})");
      if (state.error) throw new Error(state.error);
      if (state.ready === "true") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const initial = await evaluate(protocol, `({
      ready:phase47.runtime.isReady,
      ids:phase47.manager.windows().map(w=>w.window_id),
      active:phase47.manager.active_window.window_id,
      states:phase47.manager.windows().map(w=>w.getState()),
      radio:phase47.manager.windows().map(w=>w.el.dataset.radio),
      isolated:phase47.isolated.getState(),
      z:phase47.manager.windows().map(w=>Number(w.el.style.zIndex)),
      a:phase47.a.geometry(),b:phase47.b.geometry(),c:phase47.c.geometry(),
      parts:Object.keys(phase47.a._branches).sort(),
      contentKind:phase47.a.getPart('window-body').children.first().mget('kind'),
      contentText:phase47.a.getPart('window-body').children.first().el.textContent,
      contentModel:phase47.a.getPart('window-body').children.first().model.toJSON(),
      contentHtml:phase47.a.getPart('window-body').children.first().el.outerHTML,
      contentRendered:phase47.a.getPart('window-body').children.first().isRendered(),
      bodyRendered:phase47.a.getPart('window-body').isRendered(),
      rootHtml:phase47.a.el.outerHTML,
      fig:phase47.a.fig,
      classes:Array.from(phase47.a.el.classList),
      kind:phase47.a.el.dataset.kind,
      partnames:Array.from(phase47.a.el.querySelectorAll('[data-partname]')).map(e=>e.dataset.partname).sort()
    })`);
    assert.equal(initial.ready, true);
    assert.deepEqual(initial.ids, ["window-a", "window-b", "window-c"]);
    assert.equal(new Set(initial.ids).size, 3);
    assert.equal(initial.active, "window-c");
    assert.ok(initial.z[2] > initial.z[0] && initial.z[2] > initial.z[1]);
    assert.deepEqual(initial.states, [0, 0, 1]);
    assert.deepEqual(initial.radio, ["off", "off", "on"]);
    assert.equal(initial.isolated, 1);
    assert.deepEqual(initial.fig, { group: "drumee", family: "drumee-managed-window", name: "managed-window" });
    for (const name of ["drumee", "drumee-managed-window", "drumee__item", "drumee__ui", "drumee-managed-window__ui", "drumee-window"]) assert.ok(initial.classes.includes(name));
    assert.equal(initial.kind, "managed_window");
    for (const name of ["window-handle", "window-title", "window-controls", "window-body"]) assert.ok(initial.parts.includes(name));
    for (const name of ["window-handle", "window-title", "window-controls", "window-body"]) assert.ok(initial.partnames.includes(name));
    assert.equal(initial.contentKind, "note");
    assert.match(initial.contentText, /Interactive body A/, JSON.stringify({ model: initial.contentModel, html: initial.contentHtml, contentRendered: initial.contentRendered, bodyRendered: initial.bodyRendered, rootHtml: initial.rootHtml }));

    const generic_state = await evaluate(protocol, `(()=>{
      const [toggle,radio_a,radio_b]=phase47.state_widget.children.toArray();
      toggle.el.click();
      const toggle_on={state:toggle.getState(),dom:toggle.el.dataset.state};
      toggle.el.click();
      const toggle_off={state:toggle.getState(),dom:toggle.el.dataset.state};
      radio_a.el.click();
      const first=[radio_a.getState(),radio_b.getState(),radio_a.el.dataset.radiotoggle,radio_b.el.dataset.radiotoggle];
      radio_b.el.click();
      const second=[radio_a.getState(),radio_b.getState(),radio_a.el.dataset.radiotoggle,radio_b.el.dataset.radiotoggle];
      const children=phase47.state_widget.children.toArray();
      phase47.state_widget.destroy();
      return {toggle_on,toggle_off,first,second,destroyed:children.map(child=>child.isDestroyed()),connected:phase47.state_widget.el.isConnected};
    })()`);
    assert.deepEqual(generic_state.toggle_on, { state: 1, dom: "1" });
    assert.deepEqual(generic_state.toggle_off, { state: 0, dom: "0" });
    assert.deepEqual(generic_state.first, [1, 0, "on", "off"]);
    assert.deepEqual(generic_state.second, [0, 1, "off", "on"]);
    assert.deepEqual(generic_state.destroyed, [true, true, true]);
    assert.equal(generic_state.connected, false);

    const maximize = await evaluate(protocol, `(()=>{
      const before=phase47.a.geometry();
      phase47.a.getPart('window-maximize').el.click();
      const maximized={geometry:phase47.a.geometry(),state:phase47.a.getPart('window-maximize').getState()};
      phase47.a.getPart('window-maximize').el.click();
      return {before,maximized,restored:phase47.a.geometry(),restoredState:phase47.a.getPart('window-maximize').getState()};
    })()`);
    assert.deepEqual(maximize.maximized.geometry, { left: 0, top: 0, width: 1000, height: 700 });
    assert.equal(maximize.maximized.state, 1);
    assert.deepEqual(maximize.restored, maximize.before);
    assert.equal(maximize.restoredState, 0);

    const activation = await evaluate(protocol, `(()=>{
      phase47.a.minimize();
      const before={activate:phase47.events.activate_a,restore:phase47.events.restore_a,z:phase47.manager.z_index};
      phase47.manager.activate(phase47.a);
      return {before,after:{activate:phase47.events.activate_a,restore:phase47.events.restore_a,z:phase47.manager.z_index},lifecycle:phase47.a.lifecycle,state:phase47.a.getState(),others:[phase47.b.getState(),phase47.c.getState()],zIndex:Number(phase47.a.el.style.zIndex),otherZ:Math.max(Number(phase47.b.el.style.zIndex),Number(phase47.c.el.style.zIndex))};
    })()`);
    assert.equal(activation.lifecycle, "open");
    assert.equal(activation.state, 1);
    assert.deepEqual(activation.others, [0, 0]);
    assert.equal(activation.after.activate - activation.before.activate, 1);
    assert.equal(activation.after.restore - activation.before.restore, 1);
    assert.equal(activation.after.z - activation.before.z, 1);
    assert.ok(activation.zIndex > activation.otherZ);

    const direct_restore = await evaluate(protocol, `(()=>{
      phase47.a.minimize();
      const before={activate:phase47.events.activate_a,restore:phase47.events.restore_a,z:phase47.manager.z_index};
      phase47.a.restore();
      return {before,after:{activate:phase47.events.activate_a,restore:phase47.events.restore_a,z:phase47.manager.z_index},state:phase47.a.getState(),active:phase47.manager.active_window.window_id,zIndex:Number(phase47.a.el.style.zIndex),otherZ:Math.max(Number(phase47.b.el.style.zIndex),Number(phase47.c.el.style.zIndex))};
    })()`);
    assert.equal(direct_restore.state, 1);
    assert.equal(direct_restore.active, "window-a");
    assert.equal(direct_restore.after.activate - direct_restore.before.activate, 1);
    assert.equal(direct_restore.after.restore - direct_restore.before.restore, 1);
    assert.equal(direct_restore.after.z - direct_restore.before.z, 1);
    assert.ok(direct_restore.zIndex > direct_restore.otherZ);

    const explicit = await evaluate(protocol, `(()=>{
      const before={activate:phase47.events.activate_b,z:phase47.manager.z_index};
      phase47.manager.activate(phase47.b);
      return {before,after:{activate:phase47.events.activate_b,z:phase47.manager.z_index},state:phase47.b.getState(),active:phase47.manager.active_window.window_id,zIndex:Number(phase47.b.el.style.zIndex),otherZ:Math.max(Number(phase47.a.el.style.zIndex),Number(phase47.c.el.style.zIndex))};
    })()`);
    assert.equal(explicit.active, "window-b");
    assert.equal(explicit.state, 1);
    assert.equal(explicit.after.activate - explicit.before.activate, 1);
    assert.equal(explicit.after.z - explicit.before.z, 1);
    assert.ok(explicit.zIndex > explicit.otherZ);

    const header_a = await point(protocol, "[data-window_id=window-a] .drumee-window__header");
    await drag(protocol, header_a, { x: header_a.x + 110, y: header_a.y + 75 });
    const after_drag = await evaluate(protocol, "({a:phase47.a.geometry(),b:phase47.b.geometry(),c:phase47.c.geometry(),stops:phase47.events.drag_stop,active:phase47.manager.active_window.window_id,state:phase47.a.getState(),z:Number(phase47.a.el.style.zIndex),otherZ:Math.max(Number(phase47.b.el.style.zIndex),Number(phase47.c.el.style.zIndex))})");
    assert.ok(after_drag.a.left > initial.a.left + 80 && after_drag.a.top > initial.a.top + 50);
    assert.deepEqual(after_drag.b, initial.b);
    assert.deepEqual(after_drag.c, initial.c);
    assert.equal(after_drag.stops, 1);
    assert.equal(after_drag.active, "window-a");
    assert.equal(after_drag.state, 1);
    assert.ok(after_drag.z > after_drag.otherZ);
    assert.ok(after_drag.a.left + after_drag.a.width <= 1000 && after_drag.a.top + after_drag.a.height <= 700);

    const body_a = await point(protocol, "[data-window_id=window-a] .drumee-window__body");
    await drag(protocol, body_a, { x: body_a.x + 70, y: body_a.y + 40 });
    assert.deepEqual(await evaluate(protocol, "phase47.a.geometry()"), after_drag.a);

    const resize_handle = await evaluate(protocol, "(()=>{const r=document.querySelector('[data-window_id=window-b]').getBoundingClientRect();return {x:r.right-3,y:r.bottom-3}})()");
    const resize_target = await evaluate(protocol, `(()=>{const e=document.elementFromPoint(${resize_handle.x},${resize_handle.y});return {className:e.className,handles:Array.from(document.querySelectorAll('[data-window_id=window-b] .ui-resizable-handle')).map(x=>x.className)}})()`);
    await drag(protocol, resize_handle, { x: resize_handle.x + 105, y: resize_handle.y + 85 });
    const after_resize = await evaluate(protocol, "({a:phase47.a.geometry(),b:phase47.b.geometry(),c:phase47.c.geometry(),stops:phase47.events.resize_stop})");
    assert.ok(after_resize.b.width > initial.b.width + 70 && after_resize.b.height > initial.b.height + 50, JSON.stringify({ initial: initial.b, after: after_resize.b, resize_handle, resize_target }));
    assert.deepEqual(after_resize.a, after_drag.a);
    assert.deepEqual(after_resize.c, initial.c);
    assert.equal(after_resize.stops, 1);

    const shrink_handle = await evaluate(protocol, "(()=>{const r=document.querySelector('[data-window_id=window-b]').getBoundingClientRect();return {x:r.right-3,y:r.bottom-3}})()");
    await drag(protocol, shrink_handle, { x: shrink_handle.x - 500, y: shrink_handle.y - 400 });
    const minimum = await evaluate(protocol, "phase47.b.geometry()");
    assert.ok(minimum.width >= 280 && minimum.height >= 190);

    const token = await point(protocol, "#token");
    const a_center = await point(protocol, "[data-window_id=window-a] .drumee-window__body");
    await drag(protocol, token, a_center, 12);
    const drop = await evaluate(protocol, "phase47.events");
    assert.ok(drop.accept >= 1);
    assert.ok(drop.over >= 1);
    assert.equal(drop.drop, 1);
    assert.deepEqual(drop.payload, { type: "generic-token", id: 47 });

    await evaluate(protocol, "Object.assign(phase47.token.style,{left:'20px',top:'640px'});phase47.token.style.transform='none';phase47.token.style.position='absolute';phase47.token.style.width='52px';phase47.token.style.height='32px'");
    const token_again = await point(protocol, "#token");
    await protocol.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...token_again });
    await protocol.send("Input.dispatchMouseEvent", { type: "mousePressed", ...token_again, button: "left", buttons: 1, clickCount: 1 });
    await protocol.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...a_center, button: "left", buttons: 1 });
    await protocol.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 930, y: 650, button: "left", buttons: 1 });
    await protocol.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 930, y: 650, button: "left", buttons: 0, clickCount: 1 });
    assert.ok((await evaluate(protocol, "phase47.events.out")) >= 1);

    await evaluate(protocol, "Object.assign(phase47.token.style,{left:'20px',top:'640px'});phase47.token.style.transform='none'");
    const token_third = await point(protocol, "#token");
    const b_center = await point(protocol, "[data-window_id=window-b] .drumee-window__body");
    await drag(protocol, token_third, b_center, 12);
    assert.equal(await evaluate(protocol, "phase47.events.drop"), 1);

    await evaluate(protocol, "phase47.manager.activate('window-b');phase47.closed_b=phase47.b;phase47.b.getPart('window-close').el.click()");
    const closed = await evaluate(protocol, "({ids:phase47.manager.windows().map(w=>w.window_id),active:phase47.manager.active_window.window_id,connected:phase47.closed_b.el.isConnected,lifecycle:phase47.closed_b.lifecycle,destroyed:phase47.closed_b.isDestroyed(),parts:Object.keys(phase47.closed_b._branches),installed:phase47.closed_b.interactions.installed,hasData:jQuery.hasData(phase47.closed_b.el),aLifecycle:phase47.a.lifecycle,cLifecycle:phase47.c.lifecycle,aOperational:!!phase47.a.getPart('window-body')})");
    assert.deepEqual(closed.ids, ["window-a", "window-c"]);
    assert.equal(closed.connected, false);
    assert.equal(closed.lifecycle, "closed");
    assert.equal(closed.destroyed, true);
    assert.deepEqual(closed.parts, []);
    assert.deepEqual(closed.installed, { draggable: false, resizable: false, droppable: false });
    assert.equal(closed.hasData, false);
    assert.equal(closed.aLifecycle, "open");
    assert.equal(closed.cLifecycle, "open");
    assert.equal(closed.aOperational, true);
    assert.ok(["window-a", "window-c"].includes(closed.active));
  } catch (error) {
    primary_error = error;
    throw error;
  } finally {
    try {
      if (protocol) {
        try { await protocol.send("Browser.close"); } catch (_) {}
        protocol.close();
      }
      await terminate(process);
      fs.rmSync(output_path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      fs.rmSync(consumer_work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (cleanup_error) {
      if (!primary_error) throw cleanup_error;
      context.diagnostic(`cleanup error after primary failure: ${cleanup_error.stack || cleanup_error}`);
    }
  }
});
