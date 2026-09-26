"use strict";

let widgets_loaded = false;

function loadJqueryUi(jquery) {
  if (!globalThis.window || !globalThis.document) throw new Error("Window interactions require a browser DOM");
  globalThis.jQuery = jquery;
  globalThis.$ = jquery;
  if (!widgets_loaded) {
    require("jquery-ui/ui/widgets/draggable");
    require("jquery-ui/ui/widgets/resizable");
    require("jquery-ui/ui/widgets/droppable");
    widgets_loaded = true;
  }
  return jquery;
}

function interactionContext(window_view, event, ui) {
  const draggable = ui && ui.draggable;
  return {
    window: window_view,
    event,
    ui,
    draggable: draggable && draggable[0],
    payload: draggable && draggable.data("drumee_payload")
  };
}

class WindowInteractions {
  constructor(window_view, { jquery } = {}) {
    this.window = window_view;
    this.jquery = loadJqueryUi(jquery || require("jquery"));
    this.$el = this.jquery(window_view.el);
    this.installed = { draggable: false, resizable: false, droppable: false };
  }

  install() {
    const window_view = this.window;
    const manager = window_view.manager;
    const options = window_view.options;
    if (options.draggable !== false) {
      const configured = typeof options.draggable === "object" ? options.draggable : {};
      this.$el.draggable({
        distance: configured.distance == null ? 5 : configured.distance,
        containment: manager.workspace,
        scroll: false,
        handle: configured.handle || ".drumee-window__header",
        cancel: configured.cancel || ".drumee-window__body :input,.drumee-window__body [contenteditable=true]",
        start: (event, ui) => {
          manager.activate(window_view.window_id);
          window_view._interactionStart("drag", event, ui);
          if (typeof configured.start === "function") configured.start(interactionContext(window_view, event, ui));
        },
        drag: (event, ui) => {
          window_view._interactionMove("drag", event, ui);
          if (typeof configured.drag === "function") configured.drag(interactionContext(window_view, event, ui));
        },
        stop: (event, ui) => {
          window_view._interactionStop("drag", event, ui);
          if (typeof configured.stop === "function") configured.stop(interactionContext(window_view, event, ui));
        }
      });
      this.installed.draggable = true;
    }
    if (options.resizable !== false) {
      const configured = typeof options.resizable === "object" ? options.resizable : {};
      const bounds = manager.workspaceSize();
      this.$el.resizable({
        aspectRatio: false,
        handles: configured.handles || "all",
        minWidth: configured.min_width || options.min_width,
        minHeight: configured.min_height || options.min_height,
        maxWidth: bounds.width,
        maxHeight: bounds.height,
        start: (event, ui) => {
          manager.activate(window_view.window_id);
          window_view._interactionStart("resize", event, ui);
          if (typeof configured.start === "function") configured.start(interactionContext(window_view, event, ui));
        },
        resize: (event, ui) => {
          window_view._interactionMove("resize", event, ui);
          if (typeof configured.resize === "function") configured.resize(interactionContext(window_view, event, ui));
        },
        stop: (event, ui) => {
          window_view._interactionStop("resize", event, ui);
          if (typeof configured.stop === "function") configured.stop(interactionContext(window_view, event, ui));
        }
      });
      this.installed.resizable = true;
    }
    if (options.droppable && options.droppable !== false) {
      const configured = options.droppable === true ? {} : options.droppable;
      const callback = (name) => (event, ui) => {
        window_view.el.dataset.drop_state = name;
        window_view._emit(`drop:${name}`, interactionContext(window_view, event, ui));
        if (typeof configured[name] === "function") configured[name](interactionContext(window_view, event, ui));
      };
      this.$el.droppable({
        accept: configured.accept == null ? "*" : configured.accept,
        tolerance: configured.tolerance || "intersect",
        activate: callback("activate"),
        deactivate: callback("deactivate"),
        over: callback("over"),
        out: callback("out"),
        drop: callback("drop")
      });
      this.installed.droppable = true;
    }
    return this;
  }

  destroy() {
    for (const name of ["draggable", "resizable", "droppable"]) {
      if (!this.installed[name]) continue;
      try {
        this.$el[name]("destroy");
      } finally {
        this.installed[name] = false;
      }
    }
  }
}

module.exports = { WindowInteractions, interactionContext, loadJqueryUi };
