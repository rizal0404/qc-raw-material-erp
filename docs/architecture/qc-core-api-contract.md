# QC Core API Contract — Slice 03

**Base URL:** `/api/v1`  
**Authorization:** authenticated session; role `QC_ANALYST` or `SUPERVISOR_ADMIN`.

## Raw Samples

### `GET /samples`
Query:
- `materialKind?=LS|CL`
- `operationDate?=YYYY-MM-DD`
- `vendorId?`
- `sourceId?`
- `search?`
- `limit?`
- `offset?`

Response:
```json
{"ok":true,"items":[],"total":0}
```

### `GET /samples/:id`
Returns a canonical raw sample including chemistry, derived quality, snapshots, and timestamps.

### `POST /samples`
Creates one raw sample. `Sample_ID` is case-insensitively unique.

### `PATCH /samples/:id`
Partial update. `reason` is mandatory for auditable update.

### `POST /samples/import`
Body:
```json
{
  "mode":"INSERT_ONLY",
  "reason":"Legacy raw sample import",
  "rows":[]
}
```
Modes:
- `INSERT_ONLY`
- `UPSERT`

Maximum contract batch: 5,000 rows.

## Workbench

### `GET /workbench/samples?materialKind=LS&operationDate=2026-08-20`
Returns Raw Samples plus resolved `defaultTonPerRetase`.

Slice 03 has no Retase Counter integration yet, therefore mapped Retase is not authoritative in this slice.

## Mixes

### `GET /mixes`
Filters:
- `materialKind?`
- `operationDate?`
- `pileId?`
- `status?=ACTIVE|REPLACED|VOID`
- `search?`
- pagination.

### `GET /mixes/:mixCode`
Returns the ACTIVE mix, including persisted chemistry snapshots and audit indicator per item.

### `POST /mixes`
Minimum body shape:
```json
{
  "materialKind":"LS",
  "operationDate":"2026-08-20",
  "pileId":"<uuid>",
  "shiftCode":"SHIFT_1",
  "batchNo":1,
  "tiangKe":null,
  "pileCycle":1,
  "defaultTonPerRetase":25,
  "note":null,
  "items":[
    {
      "rawSampleId":"<uuid>",
      "retase":10,
      "tonPerRetase":25,
      "note":null,
      "chemistry":{
        "sio2":null,"al2o3":null,"fe2o3":null,"cao":null,"mgo":null,
        "k2o":null,"na2o":null,"so3":null,"h2o":null
      },
      "oxideChangeNote":null
    }
  ]
}
```

For Limestone, `batchNo` is mandatory. For Clay, `tiangKe` is mandatory.

### `POST /mixes/:mixCode/replace`
Same mix payload plus:
```json
{"reason":"Controlled correction"}
```
The old mix becomes `REPLACED`; the new one is the ACTIVE replacement.

## Chemistry revision

### `GET /mix-items/:id/chemistry-revisions`
Returns ordered revision history.

### `POST /mix-items/:id/chemistry-revisions`
```json
{
  "chemistry": {
    "sio2":12.1,"al2o3":3.2,"fe2o3":2.1,"cao":48.0,"mgo":1.0,
    "k2o":0.5,"na2o":0.2,"so3":0.1,"h2o":1.2
  },
  "reason":"Verifikasi ulang hasil XRF"
}
```
Raw Sample chemistry is not modified.

## Reports

### `GET /reports/mix-summary`
Filters:
- `materialKind?`
- `dateFrom?`
- `dateTo?`
- `plantId?`
- `pileId?`

### `GET /reports/pile-cumulative`
Required:
- `materialKind`

Optional:
- `cutoffDate`
- `plantId`
- `className`

### `GET /reports/qaf`
Required:
- `materialKind`
- `month=YYYY-MM`
- `plantId`

Returns daily class-group result with tonnage, chemistry, quality, QAF status, target text, and representative Mix_ID/Pile where available.

## Validation principles

- Date contract is always `YYYY-MM-DD`.
- Oxides are nullable numeric values in range 0–100.
- Retase is a positive integer in saved mix items.
- Ton/Retase is positive numeric.
- Chemistry change relative to Raw Sample requires `oxideChangeNote`.
- Replace requires a reason.
- All writes use authenticated server identity; actor role/user are not accepted from browser payload.
