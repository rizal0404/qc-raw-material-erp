BEGIN;

CREATE TABLE clay_shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_date date NOT NULL,
  shift_code text NOT NULL REFERENCES shifts(code) ON DELETE RESTRICT,
  material_kind material_kind NOT NULL DEFAULT 'CL' CHECK (material_kind='CL'),
  crusher_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','SUPERSEDED')),
  operator_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  operator_name_snapshot text,
  production_tonnage numeric(14,3) CHECK (production_tonnage IS NULL OR production_tonnage >= 0),
  running_minutes integer CHECK (running_minutes IS NULL OR running_minutes >= 0),
  total_running_minutes integer CHECK (total_running_minutes IS NULL OR total_running_minutes >= 0),
  capacity_tph numeric(14,3) CHECK (capacity_tph IS NULL OR capacity_tph >= 0),
  stock_percent numeric(7,3) CHECK (stock_percent IS NULL OR stock_percent BETWEEN 0 AND 100),
  pickup_location text,
  weather text,
  pile_filling text,
  sm numeric(12,5),
  sio2 numeric(12,5),
  h2o numeric(12,5),
  attendance_present integer CHECK (attendance_present IS NULL OR attendance_present >= 0),
  attendance_sick integer CHECK (attendance_sick IS NULL OR attendance_sick >= 0),
  attendance_overtime integer CHECK (attendance_overtime IS NULL OR attendance_overtime >= 0),
  attendance_permission integer CHECK (attendance_permission IS NULL OR attendance_permission >= 0),
  attendance_leave integer CHECK (attendance_leave IS NULL OR attendance_leave >= 0),
  note text,
  revision_reason text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clay_report_crusher_kind_fk FOREIGN KEY (crusher_id, material_kind)
    REFERENCES crushers(id, material_kind) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX clay_shift_report_version_uq ON clay_shift_reports(operation_date, shift_code, crusher_id, version);
CREATE UNIQUE INDEX clay_shift_report_current_uq ON clay_shift_reports(operation_date, shift_code, crusher_id) WHERE status <> 'SUPERSEDED';
CREATE INDEX clay_shift_report_context_idx ON clay_shift_reports(operation_date, shift_code, crusher_id, status);

CREATE TABLE clay_report_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES clay_shift_reports(id) ON DELETE CASCADE,
  material_kind material_kind NOT NULL DEFAULT 'CL' CHECK (material_kind='CL'),
  display_order integer NOT NULL CHECK (display_order >= 0),
  vendor_id uuid REFERENCES vendors(id) ON DELETE RESTRICT,
  source_id uuid REFERENCES sources(id) ON DELETE RESTRICT,
  pile_id uuid REFERENCES piles(id) ON DELETE RESTRICT,
  vendor_name_snapshot text,
  source_name_snapshot text,
  header_primary text NOT NULL CHECK (length(btrim(header_primary)) > 0),
  header_secondary text,
  input_mode text NOT NULL DEFAULT 'MASTER' CHECK (input_mode IN ('MASTER','MANUAL','BUFFER')),
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('PROVISIONAL','CONFIRMED','INACTIVE')),
  ton_per_retase_snapshot numeric(12,4) CHECK (ton_per_retase_snapshot IS NULL OR ton_per_retase_snapshot > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clay_report_column_label_ck CHECK (
    vendor_id IS NOT NULL OR source_id IS NOT NULL OR vendor_name_snapshot IS NOT NULL OR source_name_snapshot IS NOT NULL OR input_mode='BUFFER'
  ),
  CONSTRAINT clay_report_column_vendor_scope_fk FOREIGN KEY (vendor_id, material_kind)
    REFERENCES vendor_material_scopes(vendor_id, material_kind) ON DELETE RESTRICT,
  CONSTRAINT clay_report_column_source_kind_fk FOREIGN KEY (source_id, material_kind)
    REFERENCES sources(id, material_kind) ON DELETE RESTRICT,
  CONSTRAINT clay_report_column_pile_kind_fk FOREIGN KEY (pile_id, material_kind)
    REFERENCES piles(id, material_kind) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX clay_report_column_order_uq ON clay_report_columns(report_id, display_order);
CREATE UNIQUE INDEX clay_report_columns_id_report_uq ON clay_report_columns(id, report_id);
CREATE INDEX clay_report_column_report_idx ON clay_report_columns(report_id, status);
CREATE INDEX clay_report_column_vendor_idx ON clay_report_columns(vendor_id);
CREATE INDEX clay_report_column_source_idx ON clay_report_columns(source_id);

CREATE TABLE clay_report_column_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES clay_report_columns(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES loading_assignments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clay_report_column_assignment_uq UNIQUE(column_id, assignment_id)
);
CREATE INDEX clay_report_assignment_idx ON clay_report_column_assignments(assignment_id);

CREATE TABLE clay_report_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES clay_shift_reports(id) ON DELETE CASCADE,
  display_order integer NOT NULL CHECK (display_order >= 0),
  start_time time,
  end_time time,
  category text NOT NULL DEFAULT 'NOTE' CHECK (category IN ('SHIFT_CHANGE','STOP','BREAKDOWN','MAINTENANCE','NOTE')),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clay_report_log_order_uq UNIQUE(report_id, display_order),
  CONSTRAINT clay_report_log_time_pair_ck CHECK ((start_time IS NULL) = (end_time IS NULL))
);
CREATE INDEX clay_report_log_report_idx ON clay_report_operation_logs(report_id);

ALTER TABLE retase_events
  ADD COLUMN clay_report_id uuid REFERENCES clay_shift_reports(id) ON DELETE RESTRICT,
  ADD COLUMN clay_report_column_id uuid,
  ADD COLUMN entry_source text NOT NULL DEFAULT 'LIVE_COUNTER',
  ADD COLUMN entry_batch_id uuid,
  ADD COLUMN source_name_snapshot text,
  ADD CONSTRAINT retase_entry_source_ck CHECK (entry_source IN ('LIVE_COUNTER','QC_BACKFILL','IMPORT')),
  ADD CONSTRAINT retase_clay_report_shape_ck CHECK ((clay_report_id IS NULL) = (clay_report_column_id IS NULL)),
  ADD CONSTRAINT retase_clay_column_report_fk FOREIGN KEY (clay_report_column_id, clay_report_id)
    REFERENCES clay_report_columns(id, report_id) ON DELETE RESTRICT;
CREATE INDEX retase_clay_report_idx ON retase_events(clay_report_id, clay_report_column_id, event_ts);
CREATE INDEX retase_entry_batch_idx ON retase_events(entry_batch_id);

ALTER TABLE clay_shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_column_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_operation_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON clay_shift_reports, clay_report_columns, clay_report_column_assignments, clay_report_operation_logs FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON clay_shift_reports, clay_report_columns, clay_report_column_assignments, clay_report_operation_logs FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
