"use strict";

const jquery = require("jquery");
const { workspaceSize } = require("./geometry");
const { ManagedWindow } = require("./window");

let manager_serial = 0;

class WindowManager {
  constructor({ workspace, runtime, jquery: jquery_instance, base_z_index = 1000 } = {}) {
    if (!workspace || workspace.nodeType !== 1) throw new Error("WindowManager requires a workspace element");
    if (!runtime || !runtime.isReady) throw new Error("WindowManager requires ui-runtime READY");
    this.workspace = workspace;
    this.document = workspace.ownerDocument;
    this.runtime = runtime;
    this.jquery = jquery_instance || jquery;
    this.window_registry = new Map();
    this.active_window = null;
    this.serial = 0;
    this.z_index = base_z_index;
    this.radio_channel = `window-manager-${++manager_serial}`;
    const registered = this.runtime.Kind.get("managed_window");
    if (registered && registered !== ManagedWindow) throw new Error("managed_window kind is already owned by another implementation");
    if (!registered) this.runtime.Kind.register("managed_window", ManagedWindow);
    this.workspace.classList.add("drumee-window-manager");
  }

  workspaceSize() {
    return workspaceSize(this.workspace);
  }

  create(options = {}) {
    const window_id = options.window_id || `window-${++this.serial}`;
    if (this.window_registry.has(window_id)) throw new Error(`Window identity already registered: ${window_id}`);
    const offset = (this.window_registry.size % 8) * 28;
    const window_options = {
      title: "Window",
      min_width: 240,
      min_height: 160,
      geometry: { left: 24 + offset, top: 24 + offset, width: 480, height: 320 },
      draggable: true,
      resizable: true,
      droppable: false,
      ...options,
      window_id
    };
    window_options.geometry = { left: 24 + offset, top: 24 + offset, width: 480, height: 320, ...(options.geometry || {}) };
    const window_view = this.runtime.createWidget({
      ...window_options,
      kind: "managed_window",
      className: "drumee-window",
      dataset: { window_id },
      attributes: { role: "dialog", "aria-label": window_options.title },
      flow: "y",
      manager: this,
      radio: this.radio_channel,
      state: 0,
      window_options
    });
    this.window_registry.set(window_id, window_view);
    return window_view;
  }

  open(options = {}) {
    return this.create(options).open();
  }

  register(window_view) {
    if (!window_view || !window_view.window_id) throw new Error("A registered window requires window_id");
    if (this.window_registry.has(window_view.window_id)) throw new Error(`Window identity already registered: ${window_view.window_id}`);
    this.window_registry.set(window_view.window_id, window_view);
    return window_view;
  }

  get(window_id) {
    return this.window_registry.get(window_id) || null;
  }

  windows() {
    return Array.from(this.window_registry.values());
  }

  activate(window_id) {
    const window_view = typeof window_id === "string" ? this.get(window_id) : window_id;
    if (!window_view || window_view.lifecycle === "closed") return null;
    if (window_view.lifecycle === "minimized") window_view.restore({ activate: false });
    window_view.triggerMethod("change:radio", window_view);
    this.active_window = window_view;
    window_view.el.style.zIndex = String(++this.z_index);
    window_view._emit("activate", { window: window_view, z_index: this.z_index });
    return window_view;
  }

  _transferFocus(excluded_id) {
    const candidates = this.windows().filter((candidate) => candidate.window_id !== excluded_id && candidate.lifecycle === "open");
    candidates.sort((left, right) => Number(right.el.style.zIndex || 0) - Number(left.el.style.zIndex || 0));
    this.active_window = candidates[0] || null;
    if (this.active_window) this.activate(this.active_window);
  }

  close(window_id) {
    const window_view = typeof window_id === "string" ? this.get(window_id) : window_id;
    if (!window_view) return false;
    const was_active = this.active_window === window_view;
    window_view._emit("close", { window: window_view });
    window_view.destroy();
    this.window_registry.delete(window_view.window_id);
    if (was_active) this._transferFocus(window_view.window_id);
    return true;
  }

  destroy() {
    for (const window_view of this.windows()) window_view.destroy();
    this.window_registry.clear();
    this.active_window = null;
    this.workspace.classList.remove("drumee-window-manager");
  }
}

module.exports = { WindowManager };
