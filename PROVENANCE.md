# Provenance

Extraction source: `drumee/ui-team` `main`, pinned in transient's
`SOURCE_MANIFEST.md` and inspected at transient source commit recorded by the
Phase 4.7 report.

| New implementation | Historical evidence | Retained/adapted behavior |
| --- | --- | --- |
| `lib/interactions.js` | `src/drumee/builtins/window/interact/index.js::setupInteract`, `_dragStart`, `_dragStop`, `_resizeStart`, `_resize`, `_resizeStop` | jQuery UI lifecycle, five-pixel drag distance, explicit header handle, workspace containment, all resize handles, minimums, geometry synchronization. The workspace is injected rather than read through a global. |
| `lib/interactions.js` generic drop callbacks | `src/drumee/builtins/window/manager.js` jQuery UI dependency evidence and historical application drop surfaces | Adds the required coherent generic droppable contract without native-file or application semantics. |
| `lib/manager.js` | `src/drumee/modules/desk/wm/index.js` window-pool, active-window and launch orchestration | Retains only registry, identity, focus, z-order, open and close semantics. |
| `lib/window.js`, `lib/geometry.js` | `src/drumee/builtins/window/snap.js`; built-in window topbar controls and skin | Retains generic clamping, minimize/restore, maximize and left/right snap concepts with package-owned minimal shell styling. |

The historical built-in `core.js`, `utils.js` and Desk manager combine this UI
behavior with identity, media, workspace navigation, uploads, clipboard,
notifications and application policy. Those responsibilities are deliberately
outside this package. No production file is copied verbatim.
