# @drumee/window-manager

An application-neutral CommonJS Window Manager for Drumee browser applications.
It provides multiple independent windows, focus and stacking, retained geometry,
header-handle dragging, all-edge resizing, optional generic drop targets,
minimize/restore, maximize and side snapping.

The package runs above `@drumee/ui-runtime`. Pass the READY runtime when the
manager is mounted in a Drumee application:

```js
const { createWindowManager } = require("@drumee/window-manager");

const manager = createWindowManager({ workspace, runtime });
const editor = manager.open({
  title: "Editor",
  geometry: { left: 40, top: 30, width: 640, height: 420 },
  min_width: 360,
  min_height: 240,
  content: editor_element,
  droppable: {
    accept: ".application-token",
    tolerance: "pointer",
    over(context) {},
    out(context) {},
    drop(context) {
      consume(context.payload);
    }
  }
});
```

`droppable: false` is the default. Drop callbacks receive generic DOM/jQuery UI
context and an application-supplied payload; the manager assigns no business
meaning to it.

## Public API

`createWindowManager(options)` and `new WindowManager(options)` create a manager.
Managers expose `create`, `open`, `register`, `get`, `windows`, `activate`,
`close` and `destroy`. Managed windows expose `open`, `geometry`,
`applyGeometry`, `on`, `minimize`, `restore`, `toggleMaximize`, `snap`, `close`
and `destroy`.

The `./browser` entry installs the package skin and exports the same API as
`globalThis.DrumeeWindowManager`. A CSS-only consumer may import `./skin.css`.

Desktop mouse/pointer behavior is validated in Chromium. The header declares
`touch-action: none`, but Phase 4.7 does not claim validated touch emulation;
`jquery-ui-touch-punch` is intentionally not a runtime dependency.

Publication is intentionally separate from validation:

```bash
npm publish --tag next --access public
```
