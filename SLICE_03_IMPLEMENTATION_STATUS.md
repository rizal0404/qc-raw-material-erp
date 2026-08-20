# Slice 03 Implementation Status — QC Core Parity

**Application version:** v0.4.0  
**Date:** 2026-08-20  
**Slice:** 03 — Raw Samples + QC Core Parity  
**Status:** IMPLEMENTED IN SOURCE — dependency install, PostgreSQL migration runtime, API integration test, and browser UAT pending.

## 1. Scope implemented

### Database / persistence
- Unified `raw_samples` model for Limestone and Clay.
- Added legacy-compatible sample fields: operation date, source shift, loader unit, block, direction, vendor/source snapshots.
- Case-insensitive `Sample_ID` uniqueness hardening.
- `ton_per_retase_rules` configuration table and V2.8 baseline seed.
- V2.8 Pile/Plant baseline seed for Tonasa 2.3, 4, and 5.
- Quality target hardening for QAF configuration.
- Mix header parity fields for `Batch_No`, `Tiang_ke`, pile cycle, Plant/Class snapshot, controlled replace, and updater identity.
- Structured `mix_item_chemistry_revisions` with sequential revision number.
- Derived PostgreSQL view `v_mix_summary`.
- Migration `0003_qc_core_parity.sql`.

### Domain
- Shared chemistry formulas: LSF, SM, AM, NaEq, R2O3.
- V2.8-compatible weighted mix aggregation.
- Ton/Retase resolver with ordered vendor/source match rules.
- QAF rule/status engine.
- Native Mix_ID builder.
- Repository ports for raw sample, mix, chemistry audit, derived reports, and configuration.
- Legacy parity fixtures/unit tests.

### API
- Raw sample list/create/update/import.
- Workbench sample loader with default Ton/Retase resolution.
- Mix list/get/save/replace.
- Chemistry revision create/history.
- Mix Summary, Pile Cumulative, and QAF report endpoints.
- QC routes protected for `QC_ANALYST` and `SUPERVISOR_ADMIN`.

### Frontend
- `/raw-samples` native raw-sample workspace.
- `/qc-workbench` native Workbench with New/Load/Recall/Save/Replace.
- Retase and Ton/Retase keyboard navigation.
- Excel-style multirow paste for Retase + Ton/Retase.
- Chemistry snapshot View/Edit with mandatory reason.
- Persisted chemistry revision history for saved mix items.
- `/qc-reports` with Mix Summary, Pile Cumulative, and QAF views.
- Role-aware navigation.

## 2. Legacy behavior deliberately preserved

Source behavior from V2.8 is preserved for:

1. `LSF = 100*CaO/(2.8*SiO2 + 1.18*Al2O3 + 0.65*Fe2O3)`.
2. `SM = SiO2/(Al2O3 + Fe2O3)`.
3. `AM = Al2O3/Fe2O3`.
4. `NaEq = Na2O + 0.658*K2O`.
5. `R2O3 = SiO2 + Al2O3 + Fe2O3`.
6. Mix chemistry weighting uses total selected tonnage as denominator when an oxide has at least one available value, matching the existing V2.8 implementation.
7. Limestone default Ton/Retase = 25.
8. Clay default Ton/Retase = 25 with ordered legacy vendor/source key rules seeded from the existing master workbook.
9. Snapshot oxide edits do not modify `raw_samples`.
10. A reason is mandatory when chemistry snapshot differs from raw chemistry.
11. Mix replacement is controlled and historical mix rows remain traceable.
12. Pile cumulative uses the maximum pile cycle eligible at the cutoff date.
13. QAF baseline rules are preserved as initial configuration.

## 3. Controlled native differences

These are intentional and must not be treated as accidental regressions:

- Limestone and Clay samples share one normalized `raw_samples` table, separated by `material_kind`.
- Mix Summary/Pile Cumulative/QAF are derived from normalized tables rather than copied report sheets.
- Oxide changelog is structured in `mix_item_chemistry_revisions`, not an appended text cell.
- Native Mix_ID uses canonical Pile code and canonical shift code (`SHIFT_1..3`). Historical legacy IDs can be retained during migration as imported identifiers; new native IDs follow the canonical convention.
- QAF API returns actual calendar days for the requested month; UI is not required to manufacture non-existent calendar dates.

## 4. Additional hardening applied during Slice 03 review

- Replace-mix and chemistry-revision audit rows now store the real actor role, including `SUPERVISOR_ADMIN`, rather than hardcoding `QC_ANALYST`.
- Plant-specific QAF configuration is applied after generic configuration so it can override the generic baseline deterministically.
- `mixes_location_shape_ck` is installed `NOT VALID` after a best-effort backfill, so a development database with pre-Slice-03 test rows is not blocked during migration; all new/updated rows are still checked.
- Frontend event types use explicit React type imports instead of relying on the global React namespace.

## 5. Validation performed in this workspace

Completed:
- JSON/package parse checks.
- TypeScript/TSX syntax parse check without dependency resolution.
- Local relative-import existence scan.
- SQL migration structural checks.
- Formula/parity fixture verification with an independent script.
- Cross-reference checks for API route → service/repository source presence.

Not completed in this workspace because dependencies/PostgreSQL runtime are unavailable:
- `pnpm install`.
- full `pnpm typecheck` with installed packages.
- Vitest execution using project dependencies.
- migration execution against PostgreSQL/Supabase.
- Fastify API runtime integration tests.
- TanStack route generation/build.
- browser UAT.

These remain release gates before merging/deploying v0.4.0 to staging.

## 6. Recommended UAT sequence

1. Apply migrations `0000` → `0003` to a clean staging database.
2. Bootstrap admin and create a QC Analyst.
3. Confirm Master Data from Slice 02.
4. Create/import 2–3 Limestone and 2–3 Clay samples.
5. Compare LSF/SM/AM/NaEq against V2.8 values.
6. Load Workbench by material/date.
7. Verify Ton/Retase default/rule selection.
8. Save a new LS mix and a new CL mix.
9. Reload/Recall both mixes.
10. Replace one mix and verify prior row becomes historical.
11. Change one oxide snapshot with a reason; verify raw sample remains unchanged and revision history exists.
12. Compare Mix Summary, Pile Cumulative, and QAF against an equivalent V2.8 fixture.
13. Run full automated tests/build before staging deployment.

## 7. Next slice

**Slice 04 — Vendor Shift Report** is next. It must include a regression test for the prior GAS bug class: `Save Draft → reload current draft → revise → submit`, using the authoritative key `(vendor, operation_date, shift)`.
