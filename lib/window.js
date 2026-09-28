"use strict";

const { LetcBox } = require("@drumee/ui-runtime");
const { clampGeometry } = require("./geometry");
const { WindowInteractions } = require("./interactions");
const { windowSkeleton } = require("./skeleton");

class ManagedWindow extends LetcBox {
  static figName = "drumee_managed_window";

  initialize(options = {}) {
    super.initialize(options);
    this.manager = options.manager || this.mget("manager");
    this.window_options = options.window_options || options;
    this.window_id = this.window_options.window_id;
    this.lifecycle = "created";
    this.restore_geometry = null;
    this.interactions = null;
    this._content_loaded = false;
    this.declareHandlers();
    this.collection.reset(windowSkeleton(this));
  }

  tagName() {
    return "section";
  }

  events() {
    return { ...super.events(), pointerdown: "onPointerDown" };
  }

  onPointerDown() {
    this.manager.activate(this);
  }

  _feedContent(body, content) {
    if (content == null) return;
    if (typeof content === "function") return this._feedContent(body, content(this));
    if (content.nodeType) {
      body.el.append(content);
      return;
    }
    const skeleton = typeof content === "string" ? this.runtime.Skeletons.Note(content) : content;
    body.feed(skeleton);
  }

  onUiEvent(source) {
    switch (source.mget("service")) {
      case "close": this.close(); break;
      case "minimize": this.minimize(); break;
      case "maximize": this.toggleMaximize(); break;
      default: break;
    }
  }

  _emit(name, detail = {}) {
    this.trigger(name, detail);
    if (typeof this.window_options.on_event === "function") this.window_options.on_event(name, detail);
  }

  _setLifecycle(lifecycle) {
    this.lifecycle = lifecycle;
    this.mset("window_status", lifecycle);
    this.el.dataset.window_status = lifecycle;
  }

  open() {
    if (this.lifecycle === "closed") throw new Error(`Window ${this.window_id} is closed`);
    if (!this.isRendered()) this.render();
    if (!this._content_loaded) {
      this._feedContent(this.getPart("window-body"), this.window_options.content);
      this._content_loaded = true;
    }
    if (!this.el.isConnected) this.manager.workspace.append(this.el);
    this.applyGeometry(this.window_options.geometry);
    this.interactions = new WindowInteractions(this, { jquery: this.manager.jquery }).install();
    this._setLifecycle("open");
    this.manager.activate(this);
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
    const next = clampGeometry(geometry, this.manager.workspaceSize(), this.window_options);
    Object.assign(this.el.style, {
      left: `${next.left}px`, top: `${next.top}px`, width: `${next.width}px`, height: `${next.height}px`
    });
    this.window_options.geometry = next;
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
    if (this.lifecycle === "minimized") return this;
    this._setLifecycle("minimized");
    this.el.hidden = true;
    this.setState(0);
    this._emit("minimize", { window: this });
    this.manager._transferFocus(this.window_id);
    return this;
  }

  restore({ activate = true } = {}) {
    if (this.lifecycle === "closed") return this;
    this._setLifecycle("open");
    this.el.hidden = false;
    this._emit("restore", { window: this });
    if (activate) this.manager.activate(this);
    return this;
  }

  toggleMaximize() {
    let maximized;
    if (this.restore_geometry) {
      const restore_geometry = this.restore_geometry;
      this.restore_geometry = null;
      this.applyGeometry(restore_geometry);
      maximized = false;
    } else {
      this.restore_geometry = this.geometry();
      const bounds = this.manager.workspaceSize();
      this.applyGeometry({ left: 0, top: 0, width: bounds.width, height: bounds.height });
      maximized = true;
    }
    const control = this.getPart("window-maximize");
    if (control) control.setState(maximized ? 1 : 0);
    this._emit("maximize", { window: this, maximized });
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
    return this.manager.close(this);
  }

  destroy() {
    if (this.lifecycle === "closed" || this.isDestroyed()) return this;
    if (this.interactions) this.interactions.destroy();
    this._setLifecycle("closed");
    super.destroy();
    return this;
  }
}

module.exports = { ManagedWindow };
