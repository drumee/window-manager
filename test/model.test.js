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
    "createWindowManager", "workspaceSize"
  ]);
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
