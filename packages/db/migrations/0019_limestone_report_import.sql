BEGIN;

CREATE TABLE crusher_report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crusher_id uuid NOT NULL REFERENCES crushers(id),
  file_name text NOT NULL, sha256 text NOT NULL CHECK (length(sha256)=64),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','NEEDS_REVIEW','READY','CONFIRMED','FAILED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  parsed_json jsonb, draft_json jsonb, issues_json jsonb NOT NULL DEFAULT '[]',
  parser_version text, template_version text, error text,
  lease_token uuid, started_at timestamptz, completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES users(id), confirmed_at timestamptz,
  CONSTRAINT crusher_import_hash_uq UNIQUE(crusher_id,sha256)
);
CREATE INDEX crusher_import_queue_idx ON crusher_report_imports(created_at) WHERE status='QUEUED';
CREATE INDEX crusher_import_lease_idx ON crusher_report_imports(started_at) WHERE status='PROCESSING';
CREATE INDEX crusher_import_created_idx ON crusher_report_imports(crusher_id,created_at DESC);
CREATE INDEX crusher_import_actor_idx ON crusher_report_imports(created_by);
CREATE INDEX crusher_import_confirmer_idx ON crusher_report_imports(confirmed_by);
CREATE TABLE crusher_report_import_files (
  import_id uuid PRIMARY KEY REFERENCES crusher_report_imports(id),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  source_bytes bytea NOT NULL CHECK(octet_length(source_bytes) BETWEEN 1 AND 8388608),
  aligned_bytes bytea
);
CREATE TABLE parser_field_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES crusher_report_imports(id),
  parser_run integer NOT NULL, field_path text NOT NULL, observation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parser_observation_import_idx ON parser_field_observations(import_id,parser_run);
CREATE TABLE parser_field_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL REFERENCES crusher_report_imports(id),
  revision integer NOT NULL, field_path text NOT NULL, predicted_value jsonb, corrected_value jsonb,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parser_correction_import_idx ON parser_field_corrections(import_id,revision);
CREATE INDEX parser_correction_actor_idx ON parser_field_corrections(created_by);
CREATE TABLE crusher_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_id uuid NOT NULL UNIQUE REFERENCES crusher_report_imports(id),
  crusher_id uuid NOT NULL REFERENCES crushers(id), report_date date NOT NULL, shift_code text NOT NULL REFERENCES shifts(code),
  timezone text NOT NULL DEFAULT 'Asia/Makassar' CHECK(timezone='Asia/Makassar'),
  canonical_json jsonb NOT NULL, confirmed_by uuid NOT NULL REFERENCES users(id), confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crusher_report_context_uq UNIQUE(crusher_id,report_date,shift_code)
);
CREATE INDEX crusher_report_shift_idx ON crusher_reports(shift_code);
CREATE INDEX crusher_report_confirmer_idx ON crusher_reports(confirmed_by);
CREATE TABLE crusher_report_vehicle_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES crusher_reports(id),
  block_key text NOT NULL, row_index integer NOT NULL CHECK(row_index>0), dt_no text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id), assignment_aa_id uuid REFERENCES loading_assignment_aas(id),
  retase integer NOT NULL CHECK(retase>=0),
  UNIQUE(report_id,block_key,row_index)
);
CREATE INDEX crusher_row_vendor_idx ON crusher_report_vehicle_rows(vendor_id);
CREATE INDEX crusher_row_assignment_idx ON crusher_report_vehicle_rows(assignment_aa_id);
ALTER TABLE retase_events ADD COLUMN crusher_report_row_id uuid REFERENCES crusher_report_vehicle_rows(id);
CREATE INDEX retase_crusher_report_row_idx ON retase_events(crusher_report_row_id);

-- Serialize all DUMP writers by context + AA, including the existing live counter.
-- Duplicate source rows in the SAME import are legitimate; another source is not.
CREATE FUNCTION guard_crusher_photo_duplicate() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE imported boolean;
BEGIN
  IF NEW.event_type<>'DUMP' OR NEW.status='REVERSED' OR NEW.aa_id IS NULL OR NEW.material_kind='CL' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.operation_date::text||':'||NEW.shift_code||':'||NEW.crusher_id::text||':'||NEW.aa_id::text,0));
  imported := NEW.crusher_report_row_id IS NOT NULL;
  IF EXISTS (
    SELECT 1 FROM retase_events e WHERE e.id<>NEW.id AND e.operation_date=NEW.operation_date AND e.shift_code=NEW.shift_code
      AND e.crusher_id=NEW.crusher_id AND e.aa_id=NEW.aa_id AND e.event_type='DUMP' AND e.status<>'REVERSED'
      AND (imported OR e.crusher_report_row_id IS NOT NULL)
      AND (NOT imported OR e.entry_batch_id IS DISTINCT FROM NEW.entry_batch_id)
  ) THEN RAISE EXCEPTION 'Retase already exists for this photo context and DT' USING ERRCODE='23514',CONSTRAINT='crusher_photo_duplicate'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER retase_photo_duplicate_guard BEFORE INSERT OR UPDATE OF aa_id,status,crusher_id,operation_date,shift_code,crusher_report_row_id,entry_batch_id ON retase_events FOR EACH ROW EXECUTE FUNCTION guard_crusher_photo_duplicate();
REVOKE ALL ON FUNCTION guard_crusher_photo_duplicate() FROM PUBLIC;

ALTER TABLE crusher_report_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_report_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE parser_field_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE parser_field_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE crusher_report_vehicle_rows ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON crusher_report_imports,crusher_report_import_files,parser_field_observations,parser_field_corrections,crusher_reports,crusher_report_vehicle_rows FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION guard_crusher_photo_duplicate() FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
