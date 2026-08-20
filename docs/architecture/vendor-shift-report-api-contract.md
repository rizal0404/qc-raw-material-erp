# Vendor Shift Report API Contract — Slice 04

Base: `/api/v1`

## GET `/vendor/shift-reports/current`

Query:

- `operationDate=YYYY-MM-DD`
- `shiftCode=SHIFT_1|SHIFT_2|SHIFT_3`
- `vendorId=<uuid>` required for non-VENDOR users

Returns current editable draft if present; otherwise effective submitted report.

## GET `/vendor/shift-reports/effective-submitted`

Same query contract. Returns only active `SUBMITTED` version. This endpoint is the bridge for Slice 05 Counter.

## GET `/vendor/shift-reports`

Filters:

- vendorId
- operationDate
- shiftCode
- status
- limit
- offset

Returns version history/list.

## GET `/vendor/shift-reports/:id`

Returns one report including all assignments and AA members.

## POST `/vendor/shift-reports`

Creates a new DRAFT.

Payload:

```json
{
  "vendorId": "uuid",
  "operationDate": "2026-08-20",
  "shiftCode": "SHIFT_1",
  "am": {"total":4,"operating":2,"standby":1,"breakdown":1,"repair":0,"other":0},
  "aa": {"total":18,"operating":13,"standby":1,"breakdown":0,"repair":4,"other":0},
  "note": null,
  "assignments": [
    {
      "amId":"uuid",
      "sourceId":"uuid",
      "crusherId":"uuid",
      "blockSnapshot":"B9 Tengah",
      "validFrom":"07:30",
      "validTo":"11:30",
      "aaIds":["uuid","uuid"],
      "note":null
    }
  ]
}
```

Material kind and category are server-derived from Source Master.

## PUT `/vendor/shift-reports/:id/draft`

Updates an existing DRAFT. Operation Date, Shift and Vendor are immutable within the draft version. Assignment rows are replaced transactionally.

## POST `/vendor/shift-reports/:id/submit`

Submit-time validation:

- AM balance;
- AA balance;
- at least one assignment;
- at least one AA per active assignment;
- no overlap.

## POST `/vendor/shift-reports/:id/revisions`

Payload:

```json
{"reason":"AA reassignment after operational change"}
```

Creates DRAFT version `N+1` by copying the active submitted version.

## Error codes

- `VENDOR_REQUIRED`
- `DRAFT_ALREADY_EXISTS`
- `REVISION_REQUIRED`
- `REPORT_NOT_DRAFT`
- `REPORT_NOT_SUBMITTED`
- `AM_SUMMARY_UNBALANCED`
- `AA_SUMMARY_UNBALANCED`
- `ASSIGNMENT_REQUIRED`
- `AA_REQUIRED`
- `ASSIGNMENT_TIME_INVALID`
- `ASSIGNMENT_OVERLAP`
- `EQUIPMENT_VENDOR_MISMATCH`
- `MATERIAL_CRUSHER_MISMATCH`
- `INACTIVE_REFERENCE`
