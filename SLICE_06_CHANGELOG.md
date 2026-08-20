# Slice 06 Changelog — v0.7.0

## Added

- Native QC Reconciliation module and `/reconciliation` React route.
- Vendor-based Sample_ID candidate engine using Operation Date + Material Kind + Vendor.
- Mapping lifecycle: `UNMAPPED`, `SUGGESTED`, `AMBIGUOUS`, `CONFIRMED`, `CONSUMED`, `REVIEW_REQUIRED`.
- Assignment-level observed/reserved/remaining retase read model.
- QC allocation create/update/confirm APIs.
- Multiple-candidate confirmation reason requirement.
- Exception DUMP resolution to server-derived effective assignment candidates.
- Retase-event resolution audit fields.
- Workbench mapped-retase suggestion API and Apply workflow.
- Exact DUMP-event binding during transactional Mix Save.
- Allocation/event and Mix-item/allocation bridge tables.
- Database uniqueness protection against active double consumption.
- Mix Replace release/rebind flow preserving historical bindings.
- Review-on-drift for superseded upstream reports and reversed consumed events.
- Server-side guard preventing confirmed mapped retase from being silently saved as unrelated manual retase.
- Asia/Makassar browser business-date helper applied to QC pages.
- Slice 06 service tests, architecture document, API contract, ADR-012, and migration `0006_qc_reconciliation_retase_mapping.sql`.
- Post-slice Operational/Clay Assignment workflow independent from Vendor Shift Report, including API, audit trail, and migration `0008_operational_counter_assignments.sql`.

## Changed

- Mix item API payload supports `retaseAllocationIds` and `retaseOverrideReason`.
- Mix item response exposes active retase allocations and consumed mapped retase.
- Retase reversal checks event consumption state.
- Reconciliation historical assignments are shown only when they have operational history/allocation/review state.
- Repository manifest, implementation plan, PRD, README, and next-slice plan updated to v0.7.0.
- Loading Assignment supports multi-crusher AM routing, optional pile destination, and `SHIFT_REPORT`/`OPERATIONAL` origin.
- Retase Counter and Reconciliation now consume effective Operational Assignments in addition to submitted Vendor Shift Reports.

## Compatibility

- Migrations `0000`–`0005` are unchanged.
- Existing manual Retase remains available when no confirmed mapping exists.
- Existing singular `source_retase_allocation_id` remains for compatibility; new native consumption uses bridge tables.
- Existing QC chemistry, oxide audit, Mix Summary, Pile Cumulative, QAF, Vendor Shift Report, and Digital Counter behavior are not intentionally changed.

## Next

Slice 07 — Operational Reporting + Audit Explorer.
