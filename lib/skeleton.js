"use strict";

function control(Skeletons, window_view, service, label, extra = {}) {
  return Skeletons.Button.Label({
    className: `drumee-window__control drumee-window__control--${service}`,
    content: label,
    service,
    uiHandler: window_view,
    partHandler: window_view,
    sys_pn: `window-${service}`,
    tagName: "button",
    attributes: { type: "button", "aria-label": service },
    ...extra
  });
}

function windowSkeleton(window_view) {
  const { Skeletons } = window_view.runtime;
  return [
    Skeletons.Box.X({
      className: "drumee-window__header",
      sys_pn: "window-handle",
      partHandler: window_view,
      kids: [
        Skeletons.Note({
          className: "drumee-window__title",
          content: window_view.window_options.title,
          sys_pn: "window-title",
          partHandler: window_view
        }),
        Skeletons.Box.X({
          className: "drumee-window__controls",
          sys_pn: "window-controls",
          partHandler: window_view,
          kids: [
            control(Skeletons, window_view, "minimize", "−"),
            control(Skeletons, window_view, "maximize", "□", { toggle: true, state: 0 }),
            control(Skeletons, window_view, "close", "×")
          ]
        })
      ]
    }),
    Skeletons.Box.Y({
      className: "drumee-window__body",
      sys_pn: "window-body",
      partHandler: window_view
    })
  ];
}

module.exports = { windowSkeleton };
