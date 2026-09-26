"use strict";

const { clampGeometry } = require("./geometry");
const { WindowInteractions } = require("./interactions");

class ManagedWindow {
  constructor(manager, options) {
    this.manager = manager;
    this.options = options;
    this.window_id = options.window_id;
    this.state = "created";
    this.restore_geometry = null;
    this.listeners = new Map();
    this.el = this._buildElement();
    this.interactions = null;
  }

  _buildElement() {
    const document_ref = this.manager.document;
    const el = document_ref.createElement("section");
    el.className = "drumee-window";
    el.dataset.window_id = this.window_id;
    el.dataset.state = "inactive";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", this.options.title);

    const header = document_ref.createElement("header");
    header.className = "drumee-window__header";
    header.dataset.partname = "window-handle";
    const title = document_ref.createElement("span");
    title.className = "drumee-window__title";
    title.textContent = this.options.title;
    const controls = document_ref.createElement("span");
    controls.className = "drumee-window__controls";
    for (const [action, label] of [["minimize", "−"], ["maximize", "□"], ["close", "×"]]) {
      const button = document_ref.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.setAttribute("aria-label", action);
      button.textContent = label;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (action === "close") this.close();
        else if (action === "minimize") this.minimize();
        else this.toggleMaximize();
      });
      controls.append(button);
    }
    header.append(title, controls);
    const body = document_ref.createElement("div");
    body.className = "drumee-window__body";
    body.dataset.partname = "window-body";
    this._setContent(body, this.options.content);
    el.append(header, body);
    el.addEventListener("pointerdown", () => this.manager.activate(this.window_id));
    return el;
  }

  _setContent(body, content) {
    if (content == null) return;
    if (content.nodeType) body.append(content);
    else if (typeof content === "function") this._setContent(body, content(this));
    else body.textContent = String(content);
  }

  on(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
    return () => this.listeners.get(name).delete(callback);
  }

  _emit(name, detail = {}) {
    const callbacks = this.listeners.get(name) || [];
    for (const callback of callbacks) callback(detail);
    if (typeof this.options.on_event === "function") this.options.on_event(name, detail);
  }

  open() {
    if (this.state === "closed") throw new Error(`Window ${this.window_id} is closed`);
    if (!this.el.isConnected) this.manager.workspace.append(this.el);
    this.applyGeometry(this.options.geometry);
    this.interactions = new WindowInteractions(this, { jquery: this.manager.jquery }).install();
    this.state = "open";
    this.manager.activate(this.window_id);
    this._emit("open", { window: this });
    return this;
  }

  geometry() {
    const style = this.el.style;
    return {
      left: parseFloat(style.left) || 0,
      top: parseFloat(style.top) || 0,
      width: parseFloat(style.width) || this.el.offsetWidth,
      height: parseFloat(style.height) || this.el.offsetHeight
    };
  }

  applyGeometry(geometry) {
    const next = clampGeometry(geometry, this.manager.workspaceSize(), this.options);
    Object.assign(this.el.style, {
      left: `${next.left}px`, top: `${next.top}px`, width: `${next.width}px`, height: `${next.height}px`
    });
    this.options.geometry = next;
    return next;
  }

  _interactionStart(type, event, ui) {
    this.el.dataset.interaction = type;
    this._emit(`${type}:start`, { window: this, event, ui });
  }

  _interactionMove(type, event, ui) {
    this._emit(`${type}:move`, { window: this, event, ui });
  }

  _interactionStop(type, event, ui) {
    delete this.el.dataset.interaction;
    const candidate = type === "drag"
      ? { ...this.geometry(), left: ui.position.left, top: ui.position.top }
      : { ...this.geometry(), ...ui.position, ...ui.size };
    const geometry = this.applyGeometry(candidate);
    this._emit(`${type}:stop`, { window: this, event, ui, geometry });
  }

  minimize() {
    if (this.state === "minimized") return this;
    this.state = "minimized";
    this.el.dataset.minimized = "true";
    this.el.hidden = true;
    this._emit("minimize", { window: this });
    this.manager._transferFocus(this.window_id);
    return this;
  }

  restore() {
    if (this.state === "closed") return this;
    this.state = "open";
    this.el.hidden = false;
    delete this.el.dataset.minimized;
    this.manager.activate(this.window_id);
    this._emit("restore", { window: this });
    return this;
  }

  toggleMaximize() {
    if (this.restore_geometry) {
      const restore_geometry = this.restore_geometry;
      this.restore_geometry = null;
      delete this.el.dataset.maximized;
      this.applyGeometry(restore_geometry);
    } else {
      this.restore_geometry = this.geometry();
      this.el.dataset.maximized = "true";
      const bounds = this.manager.workspaceSize();
      this.applyGeometry({ left: 0, top: 0, width: bounds.width, height: bounds.height });
    }
    this._emit("maximize", { window: this, maximized: Boolean(this.restore_geometry) });
    return this;
  }

  snap(side) {
    const bounds = this.manager.workspaceSize();
    const left_width = Math.floor(bounds.width / 2);
    const right_width = bounds.width - left_width;
    this.restore_geometry = this.restore_geometry || this.geometry();
    this.applyGeometry(side === "right"
      ? { left: left_width, top: 0, width: right_width, height: bounds.height }
      : { left: 0, top: 0, width: left_width, height: bounds.height });
    this._emit("snap", { window: this, side });
    return this;
  }

  close() {
    return this.manager.close(this.window_id);
  }

  destroy() {
    if (this.state === "closed") return;
    if (this.interactions) this.interactions.destroy();
    this.listeners.clear();
    this.el.remove();
    this.state = "closed";
  }
}

module.exports = { ManagedWindow };
