"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const package_root = path.resolve(__dirname, "..");
const api = require("..");

test("package loads standalone and exposes the intentional API", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "ManagedWindow", "WindowInteractions", "WindowManager", "clampGeometry",
    "createWindowManager", "windowSkeleton", "workspaceSize"
  ]);
});

test("managed window shell is a canonical Skeleton tree", () => {
  const runtime = require("@drumee/ui-runtime");
  const window_view = { runtime, window_options: { title: "Contract Window" }, model: {} };
  const shell = api.windowSkeleton(window_view);
  assert.equal(shell.length, 2);
  assert.equal(shell[0].kind, "box");
  assert.equal(shell[0].flow, "x");
  assert.equal(shell[0].sys_pn, "window-handle");
  assert.equal(shell[0].partHandler, window_view);
  assert.equal(shell[0].kids[0].kind, "note");
  assert.equal(shell[0].kids[0].sys_pn, "window-title");
  assert.equal(shell[0].kids[1].sys_pn, "window-controls");
  assert.deepEqual(shell[0].kids[1].kids.map((item) => item.service), ["minimize", "maximize", "close"]);
  for (const control of shell[0].kids[1].kids) {
    assert.equal(control.kind, "image_svg");
    assert.equal(control.uiHandler, window_view);
    assert.equal(control.partHandler, window_view);
  }
  assert.equal(shell[1].kind, "box");
  assert.equal(shell[1].flow, "y");
  assert.equal(shell[1].sys_pn, "window-body");
});

test("geometry clamps size and position to the injected workspace", () => {
  assert.deepEqual(
    api.clampGeometry({ left: 900, top: -20, width: 400, height: 50 }, { width: 1000, height: 700 }, { min_width: 300, min_height: 180 }),
    { left: 600, top: 0, width: 400, height: 180 }
  );
});

test("production implementation excludes application and backend coupling", () => {
  const files = fs.readdirSync(path.join(package_root, "lib")).filter((name) => name.endsWith(".js"));
  const source = files.map((name) => fs.readFileSync(path.join(package_root, "lib", name), "utf8")).join("\n");
  const forbidden = [
    "system-" + "mfs", "mfs_", "Find" + "er", "folder APIs", "media APIs",
    "H" + "ub", "T" + "eam", "chat", "conference", "tasks", "server-" + "team",
    "ui-" + "team", "sources/", "window." + "Desk", "window." + "Wm"
  ];
  for (const term of forbidden) assert.equal(source.includes(term), false, `Unexpected production reference: ${term}`);
});

test("production implementation does not replace LETC structural contracts", () => {
  const files = fs.readdirSync(path.join(package_root, "lib")).filter((name) => name.endsWith(".js"));
  const source = files.map((name) => fs.readFileSync(path.join(package_root, "lib", name), "utf8")).join("\n");
  for (const pattern of [
    /document(?:_ref)?\.createElement/,
    /dataset\.partname\s*=/,
    /dataset\.state\s*=/,
    /setAttribute\(["']data-state/,
    /addEventListener\(["']click/,
    /classList\.(?:add|remove)\(["'](?:active|inactive|selected)/
  ]) assert.doesNotMatch(source, pattern);
  assert.match(source, /Skeletons\.Box\.X/);
  assert.match(source, /Skeletons\.Box\.Y/);
  assert.match(source, /Skeletons\.Note/);
  assert.match(source, /Skeletons\.Button\.Label/);
  assert.doesNotMatch(source, /function\s+(?:renderSkeleton|renderDescriptor)/);
});
