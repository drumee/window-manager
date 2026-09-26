"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
const events = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const webpack = require("webpack");

const package_root = path.resolve(__dirname, "..");

function chrome() {
  return [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean).find(fs.existsSync);
}

function compile(output_path) {
  return new Promise((resolve, reject) => webpack({
    mode: "development",
    devtool: false,
    context: package_root,
    entry: "./test/fixtures/browser-entry.js",
    output: { path: output_path, filename: "window-manager.js" },
    module: { rules: [{ test: /\.css$/, use: ["style-loader", "css-loader"] }] }
  }, (error, stats) => {
    if (error) return reject(error);
    if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
    resolve();
  }));
}

async function endpoint(port) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return (await response.json()).find((entry) => entry.type === "page");
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Chrome DevTools endpoint did not become ready");
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

test("real browser provides independent multi-window drag, resize, generic drop and cleanup", { timeout: 90000 }, async (context) => {
  if (!chrome()) return context.skip("Chromium is required");
  const output_path = fs.mkdtempSync(path.join(os.tmpdir(), "drumee-window-manager-"));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "drumee-window-manager-profile-"));
  await compile(output_path);
  fs.writeFileSync(path.join(output_path, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#workspace{width:1000px;height:700px;background:#eef2f7}#token{position:absolute;left:20px;top:640px;width:52px;height:32px;background:#ef4444;z-index:9999}</style></head><body><main id="workspace"></main><div id="token" class="generic-token">token</div><script>window.onerror=(m,s,l,c,e)=>document.body.dataset.error=String(e||m)</script><script src="window-manager.js"></script></body></html>`);
  const port = 29470 + Math.floor(Math.random() * 100);
  const process = child_process.spawn(chrome(), ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=1200,800", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let protocol;
  try {
    const page = await endpoint(port);
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
    const initial = await evaluate(protocol, "({ids:phase47.manager.windows().map(w=>w.window_id),active:phase47.manager.active_window.window_id,z:phase47.manager.windows().map(w=>Number(w.el.style.zIndex)),a:phase47.a.geometry(),b:phase47.b.geometry(),c:phase47.c.geometry()})");
    assert.deepEqual(initial.ids, ["window-a", "window-b", "window-c"]);
    assert.equal(new Set(initial.ids).size, 3);
    assert.equal(initial.active, "window-c");

    const header_a = await point(protocol, "[data-window_id=window-a] .drumee-window__header");
    await drag(protocol, header_a, { x: header_a.x + 110, y: header_a.y + 75 });
    const after_drag = await evaluate(protocol, "({a:phase47.a.geometry(),b:phase47.b.geometry(),c:phase47.c.geometry(),stops:phase47.events.drag_stop,active:phase47.manager.active_window.window_id})");
    assert.ok(after_drag.a.left > initial.a.left + 80 && after_drag.a.top > initial.a.top + 50);
    assert.deepEqual(after_drag.b, initial.b);
    assert.deepEqual(after_drag.c, initial.c);
    assert.equal(after_drag.stops, 1);
    assert.equal(after_drag.active, "window-a");
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

    await evaluate(protocol, "phase47.manager.activate('window-b');phase47.closed_b=phase47.b;phase47.manager.close('window-b')");
    const closed = await evaluate(protocol, "({ids:phase47.manager.windows().map(w=>w.window_id),active:phase47.manager.active_window.window_id,connected:phase47.closed_b.el.isConnected,state:phase47.closed_b.state,installed:phase47.closed_b.interactions.installed,hasData:jQuery.hasData(phase47.closed_b.el),aState:phase47.a.state,cState:phase47.c.state})");
    assert.deepEqual(closed.ids, ["window-a", "window-c"]);
    assert.equal(closed.connected, false);
    assert.equal(closed.state, "closed");
    assert.deepEqual(closed.installed, { draggable: false, resizable: false, droppable: false });
    assert.equal(closed.hasData, false);
    assert.equal(closed.aState, "open");
    assert.equal(closed.cState, "open");
    assert.ok(["window-a", "window-c"].includes(closed.active));
  } finally {
    if (protocol) protocol.close();
    process.kill("SIGTERM");
    await Promise.race([events.once(process, "exit"), new Promise((resolve) => setTimeout(resolve, 1500))]);
    fs.rmSync(output_path, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});
