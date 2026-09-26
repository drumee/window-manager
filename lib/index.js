"use strict";

const { clampGeometry, workspaceSize } = require("./geometry");
const { WindowInteractions } = require("./interactions");
const { WindowManager } = require("./manager");
const { ManagedWindow } = require("./window");

function createWindowManager(options) {
  return new WindowManager(options);
}

module.exports = { ManagedWindow, WindowInteractions, WindowManager, clampGeometry, createWindowManager, workspaceSize };
