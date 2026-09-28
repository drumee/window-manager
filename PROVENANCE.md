# Provenance

Extraction source: `drumee/ui-team` `main`, pinned in transient's
`SOURCE_MANIFEST.md` and inspected at transient source commit recorded by the
Phase 4.7 report.

| New implementation | Historical evidence | Retained/adapted behavior |
| --- | --- | --- |
| `lib/interactions.js` | `src/drumee/builtins/window/interact/index.js::setupInteract`, `_dragStart`, `_dragStop`, `_resizeStart`, `_resize`, `_resizeStop` | jQuery UI lifecycle, five-pixel drag distance, explicit header handle, workspace containment, all resize handles, minimums, geometry synchronization. The workspace is injected rather than read through a global. |
| `lib/interactions.js` generic drop callbacks | `src/drumee/builtins/window/manager.js` jQuery UI dependency evidence and historical application drop surfaces | Adds the required coherent generic droppable contract without native-file or application semantics. |
| `lib/manager.js` | `src/drumee/modules/desk/wm/index.js` window-pool, active-window and launch orchestration | Retains only registry, identity, focus, z-order, open and close semantics. |
| `lib/window.js`, `lib/geometry.js` | `src/drumee/builtins/window/snap.js`; built-in window topbar controls and skin | Retains generic clamping, minimize/restore, maximize and left/right snap concepts with package-owned minimal shell styling. `ManagedWindow` is a real `LetcBox`; lifecycle is stored as `window_status`, independently of LETC UI state. |
| `lib/skeleton.js` | `src/drumee/builtins/window/skeleton/**`; canonical `ui-core/letc/toolkit/{core,builder,skeletons}.js` and `toolkit/skeleton/**` | Rebuilds only the generic shell composition with public `Skeletons.Box`, `Skeletons.Note` and `Skeletons.Button` factories. `sys_pn`/`partHandler` and `service`/`uiHandler` use the normal LETC part and UI-event lifecycles; no package-local renderer exists. |
| Focus/state and Widget identity | `ui-core/letc/addons/backbone/view/{state.js,behavior.js,behavior/radio.js}` and `ui-core/letc/addons/letc.js` | Consumes the corrected `drumee/ui-runtime` contract at `c38962e2a36c2527afb2943476d091f37f64f422`. Each manager owns a distinct radio channel; canonical fig derivation/classes and `data-kind` remain runtime-owned. |

The historical built-in `core.js`, `utils.js` and Desk manager combine this UI
behavior with identity, media, workspace navigation, uploads, clipboard,
notifications and application policy. Those responsibilities are deliberately
outside this package. No production file is copied verbatim.
