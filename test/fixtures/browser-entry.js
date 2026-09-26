require("../../lib/browser");

window.addEventListener("DOMContentLoaded", () => {
  const api = window.DrumeeWindowManager;
  const workspace = document.getElementById("workspace");
  const events = { drag_stop: 0, resize_stop: 0, over: 0, out: 0, drop: 0, payload: null };
  const manager = api.createWindowManager({ workspace, runtime: { isReady: true } });
  const a = manager.open({
    window_id: "window-a", title: "Window A", geometry: { left: 120, top: 80, width: 360, height: 250 },
    content: "Interactive body A",
    droppable: {
      accept: ".generic-token", tolerance: "pointer",
      over: () => events.over++, out: () => events.out++,
      drop: (context) => { events.drop++; events.payload = context.payload; }
    }
  });
  const b = manager.open({
    window_id: "window-b", title: "Window B", geometry: { left: 520, top: 90, width: 330, height: 230 },
    min_width: 280, min_height: 190, content: "Interactive body B", droppable: false
  });
  const c = manager.open({
    window_id: "window-c", title: "Window C", geometry: { left: 300, top: 380, width: 340, height: 220 },
    content: "Interactive body C"
  });
  a.on("drag:stop", () => events.drag_stop++);
  b.on("resize:stop", () => events.resize_stop++);
  const token = document.getElementById("token");
  const $token = window.jQuery(token);
  $token.data("drumee_payload", { type: "generic-token", id: 47 });
  $token.draggable({ distance: 1, scroll: false });
  window.phase47 = { api, manager, a, b, c, token, events, closed_b: null };
  document.body.dataset.ready = "true";
});
