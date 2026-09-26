# Window Manager contribution rules

- Preserve CommonJS, Webpack compatibility and Node.js 18+ package loading.
- Keep the capability application-neutral and independent of backend services.
- Window dragging, resizing and generic drop targeting are separate behaviors.
- Install and clean up interaction widgets only through `WindowInteractions`.
- Keep data fields in `snake_case`; preserve established method contracts.
- Do not add hidden imports from transient, sibling repositories, `target/**`,
  `sources/**`, parent `node_modules` or `NODE_PATH`.
- Keep all runtime dependencies declared and package assets package-relative.
- `npm test` and `npm pack` must work from a standalone clone.
- Do not publish without explicit release authorization.
