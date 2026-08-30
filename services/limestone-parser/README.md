# Limestone parser 0.3 — trained digit recognizer and dual-engine OCR

Version 0.3 adds an optional trained CRNN digit recognizer for No. DT and
retase (count) fields. When a model is deployed, these digit-only fields use
the trained model with softmax confidence; all other fields continue to use
Tesseract. Without a model, the parser falls back to v0.2 Tesseract-only
behavior. It does not certify handwriting accuracy, auto-confirm reports,
or overwrite old drafts.

## Runtime

Keep the existing Python requirements and Tesseract `eng`. Optionally install
`onnxruntime` and deploy the trained ONNX model to `models/dt_recognizer/`.
Set `LIMESTONE_PARSER_PYTHON` and `TESSERACT_CMD` on the worker host as before.
Restart the Node worker after updating this code so the new observation contract
is loaded. It launches Python per job; subsequent jobs use the current parser.
Old imports retain their old parser result; the current retry endpoint accepts
FAILED jobs only. Re-uploading identical bytes returns the same import, not a
new parser run. Safe version-comparison/reparse is a separate follow-up.

## Geometry and limitations

`layout.py` detects enclosed grid cells to locate column boundaries, then traces
horizontal separators within DT and total columns. Local line-slope correction
produces four-point crop polygons; OCR reads a perspective-warped cell while
evidence continues to refer to the normalized source image. Both columns must
agree on row count and have continuous spacing. Missing/ambiguous grid produces
an explicit issue and marked template fallback; it is not registered geometry.

Row count is detected, not fixed to 17/13/14/11. Blank physical rows are retained
for human review. Search windows, column priors and pixel-scale tolerances still
belong to the supplied four-block, upright template. This is NOT full-page
template registration, automatic rotation correction, or arbitrary-form OCR.
Header, footer, hourly summaries and circled vendor totals still use legacy ROIs.
Forms outside the current windows can require manual correction or a new template.

The UI distinguishes DT from retase scores, labels them uncalibrated, identifies
manual corrections, shows a focused source crop and polygon, and separates
unreviewed, low-score, missing-value, geometry and assignment filters. Evidence
uses original block/row identity even after draft rows are deleted.

## Diagnose geometry without OCR

From the repository root:

```powershell
python services/limestone-parser/diagnostics.py 'C:\path\report.jpeg' --out-dir .tmp/ocr-diagnostics
```

The explicit output directory contains `layout.json`, grid mask, source overlay,
rectified field crops and a contact sheet. These contain operational data: keep
them private and out of Git. Production parsing does not export these files.

## Single-photo exact-match benchmark

Create a private label file. Values below only illustrate the format; they are
not ground truth for the supplied report:

```json
{
  "labelStatus": "provisional",
  "fields": [
    {"path":"vendors.0.vehicles.0.dtNo","kind":"dt","status":"readable","expected":"07"},
    {"path":"vendors.0.vehicles.0.retase","kind":"row-retase","status":"readable","expected":0},
    {"path":"vendors.0.vehicles.1.retase","kind":"row-retase","status":"blank","expected":null}
  ]
}
```

Use `unreadable` with `expected:null` for genuinely ambiguous source fields.
Empty OCR output counts as wrong for readable fields; blank and unreadable
fields have separate abstention/hallucination metrics. Literal zero is a readable
value, never a substitute for a blank. Duplicate DTs remain separate row labels.
Mark labels `verified` only after independent human checking/adjudication.

```powershell
python services/limestone-parser/benchmark.py 'C:\path\report.jpeg' --labels .tmp/labels.json --report .tmp/metrics.json
```

To compare saved outputs without another OCR run:

```powershell
python services/limestone-parser/benchmark.py 'C:\path\report.jpeg' --labels .tmp/labels.json --result .tmp/saved-parser-result.json --report .tmp/metrics.json
```

The saved result must belong to the labelled photo. Runtime reported for a cached
result is evaluation time, not OCR latency. Without `--labels`, output is
explicitly **coverage only, not accuracy**. The legacy positional output path
still saves complete parser JSON, including normalized image bytes.

## Crop-oracle benchmark

Add `bbox:[x,y,width,height]` in normalized 0–1 coordinates and `ocrKind`
(`dt`, `count`, `date`, `shift`, `number`, or `text`) to every label. Boxes must be
manually annotated/checked on the 1600×2200 normalized source, independently of
the tested detector. Run with `--mode oracle`. This evaluates the recognizer on
known crop positions rather than treating detector-generated boxes as ground truth.

## Dataset splits

`--manifest .tmp/dataset.json --split test` accepts:

```json
{
  "schemaVersion":"1.0",
  "samples":[{
    "id":"report-001",
    "documentId":"physical-report-001",
    "image":"photos/report-001.jpeg",
    "split":"test",
    "labelStatus":"verified",
    "fields":[{"path":"reportDate","kind":"date","status":"readable","expected":"2026-08-18"}]
  }]
}
```

Paths resolve relative to the manifest. Optional `sha256` pins the source image.
Same-document variants and duplicate image bytes cannot cross train/validation/
test splits; all splits are checked before running the selected split. Keep
writer/device holdouts in the data collection protocol. Report per-field sample
counts, exact-match, coverage and abstentions; a small provisional pilot is not a
production accuracy claim. No training or labeling is performed automatically.

## Trained digit recognizer (experimental)

Parser v0.3 supports an optional trained CRNN digit recognizer for No. DT and
retase fields. When a model is available, it replaces Tesseract for digit-only
fields; other fields continue to use Tesseract.

### Model deployment

Place the ONNX model directory at `models/dt_recognizer/` or set
`LIMESTONE_DT_MODEL_DIR`. Required files:

```text
models/dt_recognizer/
├── model.onnx         # Trained CRNN recognition model
├── digit_dict.txt     # Character dictionary (0-9)
└── config.json        # Model metadata (input_height, etc.)
```

Without a model, the parser falls back to Tesseract (v0.2 behavior). Without
`onnxruntime` installed, the parser also falls back silently.

### Training from dataset

The training dataset is at `v:\limestone_ocr_training_dataset`. To train and
export a model:

```powershell
# 1. Train PaddleOCR CRNN (requires paddlepaddle + GPU)
python v:\limestone_ocr_training_dataset\scripts\train_paddleocr.py --output-dir ./output/dt_recognizer

# 2. Export to ONNX
python v:\limestone_ocr_training_dataset\scripts\export_onnx.py --model-dir ./output/dt_recognizer/inference --output-dir services/limestone-parser/models/dt_recognizer
```

See `v:\limestone_ocr_training_dataset\README.md` for dataset details and
training data expansion guidelines.

### Confidence scoring

| Source | `sourceMethod` | `confidenceKind` | Range | Meaning |
|--------|---------------|------------------|-------|---------|
| Tesseract | `OCR` | `UNCALIBRATED` | 0–0.74 | Raw Tesseract conf, capped |
| Trained model | `TRAINED_MODEL` | `MODEL_SOFTMAX` | 0–1.0 | CTC softmax probability |

Both methods set `needsReview: true`. The trained model is used only when its
confidence exceeds 0.3; below that threshold, Tesseract is used as fallback.
Confidence calibration requires a larger validated test set (see dataset README
for target crop counts before production claims).

### Observation contract changes (v0.3)

Observations now include:

- `sourceMethod`: `"OCR"` (Tesseract), `"TRAINED_MODEL"` (CRNN), or
  `"BUSINESS_RULE"` (unchanged).
- `confidenceKind`: `"UNCALIBRATED"` (Tesseract) or `"MODEL_SOFTMAX"` (CRNN).

Consumers should use `sourceMethod` to distinguish engine provenance and
`confidenceKind` to interpret the confidence score appropriately.

## Tests

```powershell
python -m unittest discover -s services/limestone-parser -p 'test_*.py'
pnpm --filter @qc/web test -- src/features/retase/photo-report-import.test.tsx
```

Synthetic-grid tests exercise variable row counts, missing/mismatched rows and
crop geometry. Evaluator tests cover wrong-but-filled values, missing predictions,
zero/blank distinctions, duplicate DTs and split leakage. Recognizer tests cover
CTC decoding, leading zero preservation, preprocessing shape, and graceful
fallback when no model is present. These do not replace a representative
real-image test set.
# Legacy OCR tooling — production replaced by OreVision

`pnpm parser:worker` now uses `apps/api/src/modules/orevision/` and does not
launch this Python parser. These files/models remain for historical diagnostics
and benchmarks. See [OreVision setup and feature mapping](../../docs/architecture/orevision-document-extractor.md).
