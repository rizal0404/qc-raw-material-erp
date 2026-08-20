# Slice 03 Changelog — v0.4.0

## Added
- Shared QC contracts for raw samples, workbench, mix, chemistry revision, and QC reports.
- QC domain formulas and weighted aggregation parity.
- Ton/Retase rule engine and seeded legacy Clay rules.
- QAF baseline configuration/status engine.
- Raw Sample and QC repository ports/adapters.
- Migration `0003_qc_core_parity.sql`.
- `v_mix_summary` derived view.
- Raw Sample API and UI.
- Native QC Workbench API and UI.
- Controlled Mix replace flow.
- Structured chemistry snapshot revision history.
- Mix Summary, Pile Cumulative, and QAF API/UI.
- Legacy parity fixtures/tests.

## Changed
- Application version from v0.3.0 to v0.4.0.
- Mix schema hardened for Plant/Class snapshot and LS/CL location shape.
- Quality targets hardened for R2O3, priority, and effective dates.
- App navigation now exposes QC pages to QC Analyst and Supervisor/Admin.

## Compatibility notes
- Existing Slice 01 IAM and Slice 02 Master Data boundaries remain unchanged.
- Raw chemistry remains immutable from Workbench chemistry edits.
- Future Retase Mapping from Slice 06 is not yet wired into Workbench; Slice 03 still reports `retaseSource = MANUAL`.
