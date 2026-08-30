# OreVision document extractor

OreVision replaces the production Python/OpenCV/Tesseract parser. Extraction now
runs inline in the authenticated Fastify upload/reparse request; there is no
`pnpm parser:worker`, worker deployment, or continuously polling process. The
former `apps/api/src/scripts/limestone-parser-worker.ts` is an import-only
compatibility shim and never starts a process. `services/limestone-parser/` is
retained solely for historical OCR benchmarks/training diagnostics.

## Structure

- `apps/api/src/modules/orevision/`: provider transport, extraction prompt,
  normalized JPEG adapter, private configuration, authenticated routes and per-import lease processor.
- `apps/web/src/features/orevision/`: integrated workspace, settings, review,
  analytics, exports and explicit demo fixture from the original root TSX.
- `packages/contracts/src/orevision*.ts`: validated provider payload, settings,
  lossless metadata mapping into the existing report draft, and export mapping.
- `packages/domain/src/crusher-report/validation.ts`: canonical reconciliation,
  including per-DT/hour totals when the new optional matrix is present.

No new database migration is required for OreVision: its metadata and per-row
hourly cells live in the existing draft/canonical JSONB. The original photo-import
migration 0019 must already be installed. Old OCR drafts without these optional
fields remain editable; old observations/crop polygons are retained.

## Configure and run

1. Set `OREVISION_PROVIDER`, `OREVISION_MODEL`, and the matching provider key in
   the server `.env` (see `.env.example`). Defaults are configurable examples,
   not guarantees that a particular model is enabled for your account.
2. Run only the API and web. Upload and reparse requests call the configured VLM
   within the Fastify invocation, finalize the database draft, and then return.
   Vercel uses `apps/api/vercel.json` with a 300-second maximum duration.
3. A supervisor can use **Pengaturan AI** to switch Gemini, OpenAI, OpenRouter,
   or a custom Ollama/vLLM-compatible server, edit a model ID, supply/mask a key,
   test PONG connectivity and save shared configuration.
4. Upload a photo in **Retase → Laporan foto / gambar**. Review all source values,
   vendor mappings, DT assignments and totals, save corrections, then explicitly
   confirm as QC/supervisor. The extraction request never confirms or writes retase events.

The server stores settings in `../../.runtime/orevision/settings.json` relative to
`apps/api`, or `OREVISION_SETTINGS_FILE`. Keys are stored as secrets in this
private file (not encrypted at rest by the application); protect its directory
with service-account-only ACLs and encrypted storage. POSIX creation modes are
0700/0600; Windows deployments must set equivalent ACLs. Never serve this folder,
commit it, or include it in public backups. The API is the only process reading this private file. The settings file overrides environment values after
the first UI save; restart is not required for subsequent jobs. A running extraction uses the snapshot read when it starts. For local persistent deployments, use one configuration writer. On Vercel,
configure provider, model and key as Environment Variables; its function filesystem
is ephemeral, so settings saved through the UI are instance-local unless
`OREVISION_SETTINGS_FILE` points to persistent storage.

Custom requests are allowed only for URLs explicitly listed in
`OREVISION_CUSTOM_ENDPOINTS`. The browser cannot nominate an arbitrary internal
server. Redirects, embedded URL credentials, query strings and fragments are
rejected. Localhost refers to the API host, not the user's laptop. The allowlist and reachability are evaluated by that API. Keys are never
returned by GET endpoints or stored in browser localStorage. A blank key input
keeps the stored key; only **Hapus key saat simpan** deletes it at the next save.
Old prototype localStorage keys
are not imported automatically.

## Feature parity and deliberate safety changes

| Original capability            | Integrated behavior                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload and camera              | JPEG/PNG/WebP upload up to 4 MiB, camera capture and drag/drop; private source and inline API extraction                                                                                           |
| Provider/model/key settings    | Supervisor-managed server configuration, arbitrary model IDs, masked input, persistent per-provider keys and PONG test                                                                             |
| Processing status and retry    | Database lease states, concurrent-request safety and inline failed-job retry; no simulated progress                                                                                                |
| Sample fallback                | Explicit **Buka data contoh**, editable/local save/export; cannot confirm or silently replace a failed extraction                                                                                  |
| Side-by-side review            | Compact report header; equally tall source/table panels; vendor tabs; sticky table header/subtotal; operational log and production cards below; zoom/reset/grid/contrast and legacy crops retained |
| Vendor/DT/turus edits          | Compact editable DT/hour matrix with keyboard-accessible vendor tabs; expanded Mapping DT/details retains assignment, OCR score filters, add/remove rows/vendors and review/confirmation gates     |
| Mathematical verification      | Row/vendor/hour reconciliation and production/capacity checks, dynamically computed                                                                                                                |
| Header/footer/operational logs | Persisted full metadata, editable logs, signature/location, production and stock pile                                                                                                              |
| Save verification              | Revision-checked database draft/correction audit; demo saves only in memory                                                                                                                        |
| Analytics                      | Live vendor contributions, peak hour, total/average and hourly chart; no fixed sample metrics                                                                                                      |
| CSV/JSON                       | Formula-escaped CSV, clipboard JSON with fallback, JSON download and preview; current canonical review context included                                                                            |

Blank/illegible fields remain null, not zero. Leading-zero DT strings and
duplicate physical rows survive. Per-hour edits recompute row totals while
preserving the original extraction in stored parser results/observations. All
such edits reset human review. Changing shifts clears the old matrix to avoid
carrying counts into the wrong hours. Unsupported shifts remain blocked by
existing configured report columns.

AI extraction does not claim confidence scores or verified crop coordinates:
observations use `LLM_VISION`, `NOT_PROVIDED` and a null bounding box. The visual
grid is only a review aid. Failed HTTP calls, truncated/refused outputs, malformed
JSON and invalid schema yield FAILED jobs, never sample data. Images are decoded,
EXIF-oriented and JPEG-normalized before provider calls. Connection tests verify
PONG only; actual image/JSON capability is checked by the extraction request.

Uploads send operational photos to the configured provider. Choose an approved
provider or an allowlisted local model according to your data policy. No webhook
or ERP submission is performed automatically (the original prototype only
offered CSV/JSON payload exports).

## Verification

### Gemini connection troubleshooting

Use **Pengaturan AI → Google Gemini**, supply a Gemini Developer API key, then
**Muat model Gemini**. This authenticated server-side request lists the key's
`generateContent` models (including pagination); choose one supporting image/JSON
input, then **Uji koneksi** and **Simpan konfigurasi**. Listing/testing uses the
unsaved key without persisting it or switching the API's active provider. Model IDs
can be entered either as `gemini-…` or `models/gemini-…`; resource names are
normalized before constructing the endpoint, avoiding a doubled `models/` path.
OpenRouter IDs such as `google/gemini-…` are not Gemini Developer API IDs.

A missing key is a configuration error (400), not service unavailability.
Provider 404 now identifies an unavailable model/endpoint, 401/403 identifies
key/access rejection, 429 identifies quota/rate limits, and 5xx/network/timeout
errors identify provider availability. Upstream bodies and keys are not echoed;
only the HTTP status is retained in error details. The short Gemini PONG test
reserves a larger output budget for thinking models and distinguishes truncated
output. Neither listing nor PONG certifies vision/JSON or handwriting accuracy.
See Google's [Models API](https://ai.google.dev/api/models) and
[thinking token guidance](https://ai.google.dev/gemini-api/docs/thinking).

The review's green balance badge verifies complete numerical totals, not QC
approval. **Simpan verifikasi** saves the draft; final mapping/review and
**Konfirmasi ke rekonsiliasi** remain in the expandable details panel. Demo
source previews are explicitly marked illustrations and never replace a real
uploaded photo. Input/upload controls remain on the **Input & AI** tab.

### Commands

```powershell
pnpm typecheck
pnpm --filter @qc/api test -- src/modules/orevision src/modules/crusher-report
pnpm --filter @qc/web test -- src/features/orevision src/features/retase/photo-report-import.test.tsx
pnpm --filter @qc/domain test -- src/crusher-report
pnpm build
```

Provider tests use mocked HTTP responses; they do not transmit real photos or
certify model handwriting accuracy. Validate an approved model on representative
reports before operational rollout. Original OCR tooling/data has not been
deleted, retrained or modified by this replacement.

Transport references: [OpenAI image input](https://developers.openai.com/api/docs/guides/images-vision)
and [Gemini inline image input](https://ai.google.dev/gemini-api/docs/image-understanding).
