# Peta mutu pile 3D — editor geometri

## Scope

Peta Mutu now defaults to a lazy-loaded React Three Fiber / Three.js scene.
The existing SVG map is retained as an explicit 2D view and automatic fallback
when WebGL2 is unavailable, renderer initialization fails, the lazy import
fails, or the graphics context is lost. The route still owns API queries,
selection, forms and save mutations. Geometry editing requires migration 0022
and the updated API; an older API can still be viewed but cannot enable the editor.

Features: perspective/side/top cameras, zoom/pan/orbit, click/hover layer,
chronological keyboard-accessible layer list, exploded layer inspection,
selected-layer focus, REC position slider shared with the SVG and existing
save action, dynamic time/quality/status/pile legends. Historical snapshots
remain read-only for edits and REC but can still be inspected.

## Data semantics and limits

- X is the stored `startPosition` / `endPosition`, not the numeric post label.
  Reversed or repeated post labels remain display labels from `postMarks`.
- Y is the stored `bottomLevel` / `topLevel`, scaled for presentation.
- Z lower-footprint bounds are stored as `startDepth` / `endDepth`, percentages
  of warehouse width (0–100). Width = endDepth − startDepth. These are manually
  placed schematic bounds, not surveyed metres.
- Side taper remains illustrative. Collision uses conservative X/Y/Z bounds,
  not the tapered mesh. Geometry never recalculates tonnage, chemistry or stock.
- The time colour is the earliest valid `mix.operationDate` in a layer.
  Tooltip/details show the entire earliest–latest range for multi-Mix layers.
  Missing or invalid Mix dates are grey; `createdAt` is never presented as a
  fill date. Same-date ordering uses creation timestamp then layer ID solely
  as a deterministic UI ordering, not an assertion of physical fill order.
- Time scale is recalculated over the current API snapshot, not a global
  scale. Always compare the visible date legend when switching snapshots.
- Colour bins for LSF/SM preserve the previous renderer's visual thresholds;
  authoritative OK/CHECK comes from the API's `qualityStatus`.
- Pile colours use stable lot IDs rather than filtered list indexes.
- Reclaimed layers are ghosted in 3D unless selected. Coincident archived and
  active geometry can be ambiguous; use the lot status filter or layer list.
- Separation and focus are local viewing state and never persist geometry.

## Modules

- `stockpile-visual-model.ts`: pure coordinate, prism and colour functions.
- `warehouse-scene-3d.tsx`: GPU scene, camera, annotations and resource cleanup.
- `stockpile-viewport.tsx`: lazy boundary, 2D/3D switch, controls, legend and list.
- `warehouse-map.tsx`: SVG fallback and selected-layer details.
- `stockpile-3d.css`: scoped scene/control styles and mobile layout.

Rendering is on demand, DPR capped at 1.5, with shared time-scale calculation,
no external models/fonts/textures and no heavy postprocessing. The 3D engine
is an isolated lazy chunk (~255 KB gzip in the initial production build);
Vite's >500 KB raw chunk warning is expected for this engine chunk.

## Verification

`pnpm --filter @qc/web typecheck`

`pnpm --filter @qc/web test`

`pnpm --filter @qc/web build`

Browser smoke fixture (separate PowerShell terminals, from repository root):

```powershell
$env:PREVIEW_PORT='5499'
$env:PREVIEW_ORIGIN='http://localhost:5285'
$env:PREVIEW_STOCKPILE='1'
node apps/web/tests/fixtures/preview-api.mjs
```

```powershell
$env:VITE_API_BASE_URL='http://localhost:5499/api/v1'
pnpm --filter @qc/web exec vite --host 127.0.0.1 --port 5285 --strictPort
```

Run `node apps/web/tests/stockpile-visual-smoke.mjs` with Playwright available.
`PLAYWRIGHT_MODULE` may point to a bundled Playwright ESM entrypoint. Screenshots
go to `.tmp/stockpile-3d-qa`; `PILE_QA_OUTPUT` can override the directory.
The opt-in fixture is loopback-only, synthetic, GET-only and does not connect
to application sessions or databases. Smoke checks selection, controls, REC
sync, history, mobile overflow, real context loss and no-WebGL startup.

## Editing and persistence

1. Select an active layer and enable **Atur layer**.
2. Drag its body or **Geser** handle. Perspective/Atas moves along X/Z;
   Samping moves along X/Y. Camera orbit is disabled in edit mode.
3. Drag **Panjang**, **Lebar**, **Tinggi** to resize the positive end of each axis.
   Width is hidden in side view and height in top view (edge-on axes).
4. Double-click a mesh or layer chip, or use **Edit dimensi**, for numeric
   length/width/height and the three origin coordinates. Apply/Enter saves.
5. Drop autosaves once, never per pointermove. Click without movement and
   Escape/pointer cancellation do not save. Bounds clamp movement/resize.

Selection and numeric editing remain available without WebGL via the layer list
and Edit dimensi button. Drag handles require 3D. Histories and reclaimed layers
cannot be edited; explosion is reset when entering edit mode.

The route PATCHes the existing layer endpoint with `expectedVersion`, then
fetches and caches the authoritative map before showing success. Pending writes
are serialized; geometry previews are local. Failed/uncertain writes roll back
the preview and require **Muat ulang editor** before another edit (no blind retry).
Layout/date/status controls and competing layer/lot edits lock during autosave.

The service merges partial legacy x/y updates without resetting saved Z bounds,
rounds to numeric(12,4) before validation/collision, and records depth in audit.
Repository writes append an immutable geometry version in the same transaction.
Create/update/reactivate use a warehouse advisory lock BEFORE row locks, then
check ACTIVE layer overlap in all three axes. Touching faces are allowed.

### Deployment

- Apply `packages/db/migrations/0022_stockpile_layer_depth.sql` through the
  native checksum-based migration runner, in a controlled deployment.
- Deploy API then frontend. Map response `geometryEditing: true` gates the UI,
  preventing an old API from silently ignoring new depth fields.
- Migration backfills current and historical depth independently using each
  row's bottom level and the existing schematic profile; no history is replaced.
  Existing RLS/grants remain unchanged.
- This implementation was tested locally only. No operational migration was run.
- Fresh bootstrap caveat: existing migration 0020 adds enum RESERVED and uses it
  in the same transaction, causing PostgreSQL 55P04 on a database without that
  value. It was not edited here. Resolve this separately before a fresh deployment;
  the isolated geometry test precommits that value as a documented prerequisite.

### Editor tests

Add `$env:PREVIEW_STOCKPILE_EDIT='1'` to the synthetic preview server command.
This is an explicit opt-in to in-memory fixture writes; default preview stays
GET-only. Run `node apps/web/tests/stockpile-geometry-smoke.mjs` for actual mesh
double-click/body drag, three resize axes, persistence across reload, cancellation,
409 rollback/reload, read-only history, and mobile checks.

Pure/frontend tests live in `layer-geometry.test.ts` and `layer-editor.test.tsx`.
Domain geometry and API service tests cover finite bounds, DB precision, overlap,
partial update compatibility, optimistic version checks, audit and roles.

PostgreSQL/WASM integration (Node 24, no operational connection or .env):

```powershell
npm install --prefix .tmp/stockpile-sql-runtime --no-audit --no-fund @electric-sql/pglite
$modulePath=(Resolve-Path '.tmp/stockpile-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js').Path
$env:STOCKPILE_PGLITE_MODULE=([Uri]$modulePath).AbsoluteUri
pnpm --filter @qc/db exec tsx src/stockpile-geometry.integration-test.mjs
```

The test runs actual migration 0022 and repository queries for current/historical
geometry, versioned saves, collision rollback, reclaimed/reactivation checks and
RLS/grants. Bootstrap omits pgcrypto (core gen_random_uuid is available) and
precommits 0020's enum as described above. PGlite is single-connection: multi-client
advisory-lock contention still requires a PostgreSQL staging test before rollout.

## Next data-dependent phase

Confirm warehouse dimensions in metres, surveyed profile, and source/precision
of physical fill timestamps before claiming metric dimensions or surveyed volume.
Until then this feature intentionally
does not claim exact 3D inventory, hour-by-hour playback or reclaim simulation.
