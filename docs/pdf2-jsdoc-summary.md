# pdf2 JSDoc coverage

The following modules under `src/utils/pdf2/` were annotated with inline
JSDoc comments to document design decisions:

- `index.js` – entry points for planning and rendering songs.
- `measure.js` – DOM-based measurement with pt↔px conversion.
- `packer.js` – greedy, no-split column and page packing algorithm.
- `planner.js` – layout planner iterating over font sizes and columns.
- `renderer.js` – jsPDF renderer that respects the precomputed plan.
- `telemetry.js` – lightweight debugging trace helpers.

These comments describe strategies such as avoiding section splits, converting
between CSS pixels and printer points, and the greedy packing approach used for
column layout.

