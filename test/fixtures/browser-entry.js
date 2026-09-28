const ui_runtime = require("@drumee/ui-runtime");
require("@drumee/window-manager/browser");

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const runtime = await ui_runtime.bootstrap({ global: window, document });
    const api = window.DrumeeWindowManager;
    const workspace = document.getElementById("workspace");
    const events = {
      activate_a: 0, activate_b: 0, restore_a: 0,
      drag_stop: 0, resize_stop: 0,
      accept: 0, over: 0, out: 0, drop: 0, payload: null
    };
    const manager = api.createWindowManager({ workspace, runtime });
    const state_widget = runtime.mount(runtime.Skeletons.Box.X({
      kids: [
        runtime.Skeletons.Note({ content: "toggle", toggle: true, state: 0 }),
        runtime.Skeletons.Note({ content: "radio toggle a", radiotoggle: "phase47-radio-toggle", state: 0 }),
        runtime.Skeletons.Note({ content: "radio toggle b", radiotoggle: "phase47-radio-toggle", state: 0 })
      ]
    }), document.getElementById("state-engine"));
    const a = manager.open({
      window_id: "window-a", title: "Window A", geometry: { left: 120, top: 80, width: 360, height: 250 },
      content: runtime.Skeletons.Note({ content: "Interactive body A", sys_pn: "content-note" }),
      droppable: {
        accept(candidate) { events.accept++; return candidate.is(".generic-token"); },
        tolerance: "pointer",
        over: () => events.over++, out: () => events.out++,
        drop: (context) => { events.drop++; events.payload = context.payload; }
      }
    });
    const b = manager.open({
      window_id: "window-b", title: "Window B", geometry: { left: 520, top: 90, width: 330, height: 230 },
      min_width: 280, min_height: 190, content: runtime.Skeletons.Note("Interactive body B"), droppable: false
    });
    const c = manager.open({
      window_id: "window-c", title: "Window C", geometry: { left: 300, top: 380, width: 340, height: 220 },
      content: [runtime.Skeletons.Note("Interactive body C")]
    });
    a.on("activate", () => events.activate_a++);
    b.on("activate", () => events.activate_b++);
    a.on("restore", () => events.restore_a++);
    a.on("drag:stop", () => events.drag_stop++);
    b.on("resize:stop", () => events.resize_stop++);
    const token = document.getElementById("token");
    const $token = window.jQuery(token);
    $token.data("drumee_payload", { type: "generic-token", id: 47 });
    $token.draggable({ distance: 1, scroll: false });

    const workspace_two = document.getElementById("workspace-two");
    const manager_two = api.createWindowManager({ workspace: workspace_two, runtime, base_z_index: 2000 });
    const isolated = manager_two.open({ window_id: "isolated", title: "Isolated", content: runtime.Skeletons.Note("Isolated") });

    window.phase47 = { api, runtime, state_widget, manager, manager_two, isolated, a, b, c, token, events, closed_b: null };
    document.body.dataset.ready = "true";
  } catch (error) {
    document.body.dataset.error = error && (error.stack || error.message) || String(error);
  }
});
