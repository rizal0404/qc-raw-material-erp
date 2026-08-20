BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE role_code AS ENUM ('VENDOR','CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_status AS ENUM ('ACTIVE','DEACTIVATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE material_kind AS ENUM ('LS','CL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE equipment_type AS ENUM ('AM','AA'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE shift_report_status AS ENUM ('DRAFT','SUBMITTED','LOCKED','REVISED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE assignment_status AS ENUM ('ACTIVE','CLOSED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE retase_event_type AS ENUM ('DUMP','REVERSAL','MANUAL_CORRECTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE retase_event_status AS ENUM ('VALID','EXCEPTION_UNASSIGNED','AMBIGUOUS','REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE mapping_status AS ENUM ('UNMAPPED','SUGGESTED','AMBIGUOUS','CONFIRMED','CONSUMED','REVIEW_REQUIRED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE mix_status AS ENUM ('ACTIVE','REPLACED','VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  contact_email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role role_code NOT NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_vendor_role_ck CHECK ((role = 'VENDOR' AND vendor_id IS NOT NULL) OR role <> 'VENDOR')
);
CREATE INDEX users_vendor_idx ON users(vendor_id);
CREATE INDEX users_status_idx ON users(status);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE crushers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  material_kind material_kind NOT NULL,
  plant_id uuid REFERENCES plants(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX crushers_kind_idx ON crushers(material_kind);

CREATE TABLE user_crusher_scopes (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crusher_id uuid NOT NULL REFERENCES crushers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, crusher_id)
);

CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  type equipment_type NOT NULL,
  unit_no text NOT NULL,
  brand text,
  model text,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  UNIQUE(vendor_id, type, unit_no)
);
CREATE INDEX equipment_vendor_idx ON equipment(vendor_id);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  block text,
  material_category text NOT NULL,
  material_kind material_kind NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX sources_kind_idx ON sources(material_kind);

CREATE TABLE piles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  material_kind material_kind NOT NULL,
  plant_id uuid REFERENCES plants(id) ON DELETE RESTRICT,
  class_name text,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE shifts (
  code text PRIMARY KEY,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE quality_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_kind material_kind NOT NULL,
  plant_id uuid REFERENCES plants(id) ON DELETE RESTRICT,
  class_name text,
  lsf_min numeric(12,4), lsf_max numeric(12,4),
  sm_min numeric(12,4), sm_max numeric(12,4),
  am_min numeric(12,4), am_max numeric(12,4),
  naeq_max numeric(12,4),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE raw_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id text NOT NULL UNIQUE,
  material_kind material_kind NOT NULL,
  sample_date date NOT NULL,
  no_sample text,
  type_grade text,
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT,
  vendor_snapshot text,
  source_id uuid REFERENCES sources(id) ON DELETE RESTRICT,
  source_snapshot text,
  plant_id uuid REFERENCES plants(id) ON DELETE RESTRICT,
  sio2 numeric(12,5), al2o3 numeric(12,5), fe2o3 numeric(12,5), cao numeric(12,5),
  mgo numeric(12,5), k2o numeric(12,5), na2o numeric(12,5), so3 numeric(12,5), h2o numeric(12,5),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX raw_samples_date_kind_idx ON raw_samples(sample_date, material_kind);
CREATE INDEX raw_samples_vendor_date_idx ON raw_samples(vendor_id, sample_date);

CREATE TABLE vendor_shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_date date NOT NULL,
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status shift_report_status NOT NULL DEFAULT 'DRAFT',
  am_total integer NOT NULL DEFAULT 0 CHECK (am_total >= 0),
  am_operating integer NOT NULL DEFAULT 0 CHECK (am_operating >= 0),
  am_standby integer NOT NULL DEFAULT 0 CHECK (am_standby >= 0),
  am_breakdown integer NOT NULL DEFAULT 0 CHECK (am_breakdown >= 0),
  am_repair integer NOT NULL DEFAULT 0 CHECK (am_repair >= 0),
  am_other integer NOT NULL DEFAULT 0 CHECK (am_other >= 0),
  aa_total integer NOT NULL DEFAULT 0 CHECK (aa_total >= 0),
  aa_operating integer NOT NULL DEFAULT 0 CHECK (aa_operating >= 0),
  aa_standby integer NOT NULL DEFAULT 0 CHECK (aa_standby >= 0),
  aa_breakdown integer NOT NULL DEFAULT 0 CHECK (aa_breakdown >= 0),
  aa_repair integer NOT NULL DEFAULT 0 CHECK (aa_repair >= 0),
  aa_other integer NOT NULL DEFAULT 0 CHECK (aa_other >= 0),
  note text,
  revision_reason text,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_date, shift_code, vendor_id, version),
  CONSTRAINT vendor_shift_am_balance_ck CHECK (am_total = am_operating + am_standby + am_breakdown + am_repair + am_other),
  CONSTRAINT vendor_shift_aa_balance_ck CHECK (aa_total = aa_operating + aa_standby + aa_breakdown + aa_repair + aa_other)
);
CREATE INDEX vendor_shift_current_idx ON vendor_shift_reports(operation_date, shift_code, vendor_id, status);

CREATE TABLE loading_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES vendor_shift_reports(id) ON DELETE CASCADE,
  operation_date date NOT NULL,
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  am_id uuid NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES sources(id) ON DELETE RESTRICT,
  block_snapshot text,
  material_category text NOT NULL,
  material_kind material_kind NOT NULL,
  crusher_id uuid NOT NULL REFERENCES crushers(id) ON DELETE RESTRICT,
  valid_from time,
  valid_to time,
  status assignment_status NOT NULL DEFAULT 'ACTIVE',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX loading_assignment_report_idx ON loading_assignments(report_id);
CREATE INDEX loading_assignment_counter_idx ON loading_assignments(operation_date, shift_code, crusher_id, status);

CREATE TABLE loading_assignment_aas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES loading_assignments(id) ON DELETE CASCADE,
  aa_id uuid NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  valid_from time,
  valid_to time,
  active boolean NOT NULL DEFAULT true,
  note text,
  UNIQUE(assignment_id, aa_id)
);
CREATE INDEX assignment_aa_lookup_idx ON loading_assignment_aas(aa_id, assignment_id);

CREATE TABLE retase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  operation_date date NOT NULL,
  event_ts timestamptz NOT NULL DEFAULT now(),
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  crusher_id uuid NOT NULL REFERENCES crushers(id) ON DELETE RESTRICT,
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES loading_assignments(id) ON DELETE RESTRICT,
  assignment_aa_id uuid REFERENCES loading_assignment_aas(id) ON DELETE RESTRICT,
  am_id uuid REFERENCES equipment(id) ON DELETE RESTRICT,
  aa_id uuid REFERENCES equipment(id) ON DELETE RESTRICT,
  delta integer NOT NULL CHECK (delta IN (-1,1)),
  event_type retase_event_type NOT NULL,
  status retase_event_status NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reverses_event_id uuid REFERENCES retase_events(id) ON DELETE RESTRICT,
  reason text,
  client_ts timestamptz,
  CONSTRAINT retase_reversal_shape_ck CHECK (
    (event_type = 'REVERSAL' AND delta = -1 AND reverses_event_id IS NOT NULL AND reason IS NOT NULL)
    OR (event_type <> 'REVERSAL' AND delta = 1)
  )
);
CREATE UNIQUE INDEX retase_reversal_once_uq ON retase_events(reverses_event_id) WHERE reverses_event_id IS NOT NULL;
CREATE INDEX retase_counter_idx ON retase_events(operation_date, shift_code, crusher_id);
CREATE INDEX retase_assignment_idx ON retase_events(assignment_id, event_ts);
CREATE INDEX retase_aa_idx ON retase_events(aa_id, event_ts);

CREATE TABLE mixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_code text NOT NULL UNIQUE,
  material_kind material_kind NOT NULL,
  operation_date date NOT NULL,
  pile_id uuid REFERENCES piles(id) ON DELETE RESTRICT,
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  location_ref text NOT NULL,
  pile_cycle integer NOT NULL DEFAULT 1 CHECK (pile_cycle > 0),
  default_ton_per_retase numeric(12,4) NOT NULL CHECK (default_ton_per_retase > 0),
  status mix_status NOT NULL DEFAULT 'ACTIVE',
  replaces_mix_id uuid REFERENCES mixes(id) ON DELETE RESTRICT,
  note text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mixes_date_kind_idx ON mixes(operation_date, material_kind);

CREATE TABLE qc_retase_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_date date NOT NULL,
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  crusher_id uuid NOT NULL REFERENCES crushers(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES loading_assignments(id) ON DELETE RESTRICT,
  sample_id uuid REFERENCES raw_samples(id) ON DELETE RESTRICT,
  mapping_status mapping_status NOT NULL DEFAULT 'UNMAPPED',
  observed_retase integer NOT NULL DEFAULT 0 CHECK (observed_retase >= 0),
  approved_retase integer CHECK (approved_retase IS NULL OR approved_retase >= 0),
  mix_id uuid REFERENCES mixes(id) ON DELETE RESTRICT,
  note text,
  confirmed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qc_alloc_consumed_shape_ck CHECK (
    (mapping_status <> 'CONSUMED') OR (mix_id IS NOT NULL AND consumed_at IS NOT NULL AND approved_retase IS NOT NULL)
  )
);
CREATE INDEX qc_alloc_assignment_idx ON qc_retase_allocations(assignment_id, mapping_status);
CREATE INDEX qc_alloc_sample_idx ON qc_retase_allocations(sample_id, mapping_status);
CREATE UNIQUE INDEX qc_alloc_consumed_once_uq ON qc_retase_allocations(id, mix_id) WHERE mapping_status='CONSUMED';

CREATE TABLE mix_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_id uuid NOT NULL REFERENCES mixes(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES raw_samples(id) ON DELETE RESTRICT,
  retase integer NOT NULL CHECK (retase > 0),
  ton_per_retase numeric(12,4) NOT NULL CHECK (ton_per_retase > 0),
  tonnage numeric(16,4) NOT NULL CHECK (tonnage > 0),
  chemistry_snapshot jsonb NOT NULL,
  source_retase_allocation_id uuid REFERENCES qc_retase_allocations(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mix_id, sample_id)
);
CREATE INDEX mix_item_sample_idx ON mix_items(sample_id);
CREATE UNIQUE INDEX mix_item_retase_allocation_uq ON mix_items(source_retase_allocation_id) WHERE source_retase_allocation_id IS NOT NULL;

CREATE TABLE mix_item_chemistry_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_item_id uuid NOT NULL REFERENCES mix_items(id) ON DELETE CASCADE,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_ts timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role_snapshot text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  reason text,
  request_id text
);
CREATE INDEX audit_entity_idx ON audit_logs(entity_type, entity_id, event_ts);
CREATE INDEX audit_actor_idx ON audit_logs(actor_user_id, event_ts);

-- Canonical shift seed
INSERT INTO shifts(code, name, start_time, end_time, crosses_midnight)
VALUES
 ('SHIFT_1','Shift 1','07:30','15:30',false),
 ('SHIFT_2','Shift 2','15:30','22:30',false),
 ('SHIFT_3','Shift 3','22:30','07:30',true)
ON CONFLICT (code) DO NOTHING;

-- Canonical crusher seed. plant_id intentionally nullable until master plant is mapped.
INSERT INTO crushers(code, name, material_kind)
VALUES
 ('CR_LS_23','CR LS 23','LS'),
 ('CR_LS_4','CR LS 4','LS'),
 ('CR_LS_5','CR LS 5','LS'),
 ('CR_CY_4','CR CY 4','CL'),
 ('CR_CY_5','CR CY 5','CL')
ON CONFLICT (code) DO NOTHING;

COMMIT;
