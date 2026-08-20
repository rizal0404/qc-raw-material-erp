# Slice 03 Architecture — Raw Samples + QC Core Parity

## 1. Objective

Move the existing QC calculation path from Google Sheets/Apps Script into the native architecture without changing the business meaning of sample chemistry, Retase, Ton/Retase, Mix Detail, chemistry snapshot audit, Mix Summary, Pile Cumulative, or QAF.

The key boundary is:

```text
React Workbench
      ↓
REST /api/v1
      ↓
QC Application Service
      ↓
QC Domain Rules
      ↓
QcRepository
      ↓
Drizzle/PostgreSQL
```

The React client may calculate preview metrics for UX, but PostgreSQL/API data remain authoritative after save.

## 2. Native data model

### 2.1 Raw samples

Legacy Limestone and Clay raw DB sheets are consolidated into `raw_samples`.

Important columns:
- `sample_id`
- `material_kind`
- `sample_date` exposed as `operationDate`
- `no_sample`
- `source_shift`
- `type_grade`
- `vendor_id` + `vendor_snapshot`
- `source_id` + `source_snapshot`
- `plant_id`
- `loader_unit_no`
- `block`
- `direction`
- oxide columns: SiO2, Al2O3, Fe2O3, CaO, MgO, K2O, Na2O, SO3, H2O
- `note`

The snapshot strings preserve historical text even when the related master label changes later.

### 2.2 Mixes

```text
mixes
  └── mix_items
        └── mix_item_chemistry_revisions
```

`mixes` owns the operational header. `mix_items` owns Retase, Ton/Retase, tonnage, and chemistry snapshot per sample. Chemistry revisions are append-only history rows.

### 2.3 Derived summary

`v_mix_summary` derives weighted chemistry and quality metrics from active mix rows. It is not a second manually maintained source of truth.

## 3. Chemistry parity rules

### Derived quality

```text
LSF  = 100*CaO / (2.8*SiO2 + 1.18*Al2O3 + 0.65*Fe2O3)
SM   = SiO2 / (Al2O3 + Fe2O3)
AM   = Al2O3 / Fe2O3
NaEq = Na2O + 0.658*K2O
R2O3 = SiO2 + Al2O3 + Fe2O3
```

Zero or incomplete denominator inputs return `null`, not an invented numeric value.

### Weighted chemistry

For selected mix rows:

```text
row_tonnage = retase * ton_per_retase
mix_total_ton = Σ row_tonnage
oxide_mix = Σ(row_tonnage * oxide) / mix_total_ton
```

An oxide becomes `null` only when no selected row provides that oxide. This intentionally follows V2.8 denominator behavior.

## 4. Ton/Retase resolver

Rules are stored in `ton_per_retase_rules`.

Resolution order:
1. active `MATCH_KEY` rules by ascending priority;
2. compare normalized key against Vendor snapshot and Source snapshot using the legacy-compatible equality/substring policy;
3. first matching rule wins;
4. otherwise material default rule;
5. application fallback remains 25 only as a defensive fallback.

The initial Clay rules preserve the row order from the legacy master workbook. Therefore a generic key appearing before a more specific key remains able to win, matching legacy behavior until business owners explicitly revise the rule order.

## 5. Mix lifecycle

### New save
1. Validate material/date/pile/shift/location/cycle.
2. Validate every selected Raw Sample.
3. Ensure Raw Sample material/date match the mix header.
4. Calculate/validate chemistry snapshot and mandatory note if snapshot differs from raw chemistry.
5. Build canonical native Mix_ID.
6. Insert mix and items in one database transaction.
7. If a snapshot differs from raw chemistry, create revision 1.
8. Return canonical persisted Mix View.

### Recall
Read the active mix by Mix_ID and use the saved chemistry snapshot, not current Raw Sample chemistry, for existing mix items.

### Replace
1. Lock current ACTIVE mix.
2. Mark current row `REPLACED`.
3. Insert replacement mix/items.
4. Link `replaces_mix_id`.
5. Write audit event with actor and reason.
6. Commit atomically.

The partial unique index only applies to ACTIVE Mix_ID values, allowing controlled historical replacement.

## 6. Chemistry revision

A revision is only permitted for an ACTIVE mix item.

```text
raw_samples chemistry     ← unchanged
mix_items snapshot        ← updated
mix_item_chemistry_revisions
  before_snapshot
  after_snapshot
  reason
  changed_by
  changed_at
  revision_no
```

No-change submissions do not create a revision.

## 7. Reporting parity

### Mix Summary
Derived from ACTIVE `mixes + mix_items` through `v_mix_summary`.

### Pile Cumulative
For each active Pile under the filter:
1. take summary rows up to cutoff date;
2. select maximum `pile_cycle`;
3. aggregate only rows in that cycle;
4. derive chemistry/quality/status.

### QAF
Initial groups follow the existing V2.8 organization:

Limestone:
- Barat / Utara
- Timur / Selatan
- Filler

Clay:
- Utara
- Selatan

Initial target configuration is seeded from the existing master behavior and stored in `quality_targets`, so future target changes are data/config changes rather than hardcoded frontend changes.

## 8. Authorization

All Slice 03 endpoints require:
- `QC_ANALYST`, or
- `SUPERVISOR_ADMIN`.

Authorization is enforced on API routes. UI visibility is convenience only.

## 9. Future extension boundary

Slice 06 will add mapped Retase from Digital Counter/Reconciliation. It must integrate through the Workbench/API contract without changing the chemistry engine:

```text
Confirmed QC Retase Allocation
        ↓
Workbench Mapped Retase suggestion
        ↓
QC review/override
        ↓
Save Mix transaction
```

Until then Workbench returns `retaseSource = MANUAL`.

## 10. Known release gates

Source implementation is complete, but v0.4.0 is not production-approved until:
- dependencies install;
- TypeScript full typecheck passes;
- migrations run on PostgreSQL staging;
- tests execute;
- browser UAT confirms route generation, CRUD, Workbench, and report behavior;
- parity comparison is completed against representative legacy records.
