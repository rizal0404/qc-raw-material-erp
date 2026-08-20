# Slice 02 — Master Data

**Implementation version:** v0.3.0  
**Status:** IMPLEMENTED IN SOURCE — database/browser runtime UAT still required.

## Objective

Provide one canonical master-data layer shared by IAM, Vendor Shift Report, Digital Counter, Reconciliation, QC Workbench, migration tooling, and future modules. The implementation preserves the modular-monolith boundary:

```text
React/TanStack UI
      ↓
/api/v1 REST
      ↓
Master application service
      ↓
MasterRepository port
      ↓
Drizzle/PostgreSQL adapter
      ↓
PostgreSQL / Supabase initially
```

Frontend never reads Supabase tables directly.

## Implemented masters

1. Vendors
2. Equipment (`AM` / `AA`) scoped by vendor
3. Crushers (`LS` / `CL`)
4. Sources / Blocks / Material Category
5. Plants
6. Piles
7. Shifts as read-only canonical lookup for downstream forms
8. Material categories as extensible text values, initially seeded/derived with `PILE` and `FILLER`

## Vendor alias normalization

`vendors.aliases[]` remains temporarily for compatibility with the original schema, but migration `0002_master_data_hardening.sql` adds:

```text
vendor_aliases
  id
  vendor_id
  alias
  normalized_alias UNIQUE
```

Repository writes keep both structures synchronized. `vendor_aliases` is the future migration/data-cleaning lookup surface; aliases are globally unique after whitespace/case normalization to avoid ambiguous vendor matching.

## Canonicalization rules

### Codes

Input such as:

```text
cr ls 5
```

is stored as:

```text
CR_LS_5
```

Rules:

- trim;
- uppercase;
- internal whitespace → `_`;
- case-insensitive DB unique index.

### Equipment unit number

- trim;
- uppercase;
- repeated spaces collapsed;
- business key is case-insensitive:

```text
vendor_id + type + unit_no
```

### Material category

- trim;
- uppercase;
- whitespace → `_`;
- database column remains text so future categories do not require an enum migration.

## Lifecycle

No destructive delete endpoint exists.

Master row lifecycle:

```text
ACTIVE ↔ INACTIVE
```

When `active` changes, `reason` is mandatory. Create/update/status actions are written to `audit_logs` with actor, role snapshot, request ID, before/after snapshot, and optional reason.

Historical foreign keys remain valid when a master is deactivated.

## Referential checks

Application service validates foreign references before mutation:

- equipment → vendor;
- crusher → plant when present;
- pile → plant when present.

Database foreign keys remain the final integrity boundary.

## Uniqueness controls

Application checks plus DB indexes protect:

- vendor code;
- vendor normalized alias;
- plant code;
- crusher code;
- source code;
- pile code;
- equipment `(vendor_id, type, lower(unit_no))`.

## Lookup API

The CRUD admin API is intentionally separated from form lookups.

### Master bootstrap

```http
GET /api/v1/lookups/master
```

Returns only ACTIVE master data:

- vendors;
- plants;
- crushers;
- sources;
- piles;
- shifts;
- material categories.

Scope behavior:

- `VENDOR`: vendor list is restricted to its own vendor;
- `CRUSHER_OPERATOR`: crusher list is restricted to assigned crusher scope;
- `QC_ANALYST` / `SUPERVISOR_ADMIN`: all active options.

### Equipment lookup

```http
GET /api/v1/lookups/equipment?vendorId=<uuid>&type=AA
```

`VENDOR` role cannot override its own vendor scope.

## Admin CRUD API

`SUPERVISOR_ADMIN` only:

```text
GET/POST/PATCH /api/v1/vendors
GET/POST/PATCH /api/v1/equipment
GET/POST/PATCH /api/v1/crushers
GET/POST/PATCH /api/v1/sources
GET/POST/PATCH /api/v1/plants
GET/POST/PATCH /api/v1/piles
```

Lists support:

- `search`;
- `active=true|false|all`;
- `limit`;
- `offset`;
- entity-specific filters such as vendor, equipment type, plant, and material kind.

## Frontend UI/UX

Route:

```text
/master-data
```

Admin workspace provides:

- master tabs;
- search;
- status filter;
- vendor → equipment filter;
- material-kind filter;
- TanStack Table rendering;
- create/edit modal;
- status change reason;
- responsive layout.

Current tabs:

- Vendor
- Equipment
- Crusher
- Source / Block
- Plant
- Pile

## IAM integration added in Slice 02

Route:

```text
/user-management
```

The existing Slice 01 IAM API is now wired to canonical Master Data lookups so administrator user forms can select:

- `vendor_id` for `VENDOR`;
- relational crusher scopes for `CRUSHER_OPERATOR`.

During this integration a missing `updateManagedUser()` application-service method from Slice 01 was identified and implemented. This is a corrective compatibility fix because the Slice 01 API route already referenced that method.

## Migration 0002

`packages/db/migrations/0002_master_data_hardening.sql` adds:

- `vendor_aliases`;
- uniform `created_at` / `updated_at` on master tables;
- case-insensitive unique indexes;
- active/filter indexes;
- `touch_updated_at()` trigger for master tables;
- backfill of existing vendor alias arrays.

## Minimum UAT

### Vendor

1. create `PT TEST`;
2. duplicate code with different case is rejected;
3. duplicate normalized alias is rejected;
4. edit name;
5. deactivate without reason is rejected;
6. deactivate with reason succeeds;
7. historical references remain intact.

### Equipment

1. create Vendor A / AA 12;
2. duplicate Vendor A / AA 12 rejected;
3. Vendor B / AA 12 allowed;
4. AM 12 for Vendor A allowed because equipment type differs;
5. vendor filter shows correct rows.

### Crusher

Verify canonical existing crushers:

- `CR_LS_23`
- `CR_LS_4`
- `CR_LS_5`
- `CR_CY_4`
- `CR_CY_5`

and map plant as needed.

### Lookup scope

- Vendor sees only its vendor in vendor lookup;
- Crusher Operator sees only assigned crushers;
- Supervisor/Admin sees all active options.

### User Management

1. create `VENDOR` user with vendor scope;
2. create `CRUSHER_OPERATOR` with ≥1 crusher scope;
3. edit role/scope;
4. validate audit and session revocation behavior.

## Out of scope for Slice 02

- quality-target editor;
- Ton/Retase rule editor;
- raw sample import;
- Workbench;
- Vendor Shift Report;
- Retase Counter;
- Reconciliation.

Those remain later slices.
