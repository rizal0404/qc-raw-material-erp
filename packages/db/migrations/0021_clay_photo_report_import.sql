BEGIN;

CREATE TABLE clay_report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crusher_id uuid NOT NULL REFERENCES crushers(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','PROCESSING','NEEDS_REVIEW','READY','CONFIRMED','FAILED')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  parsed_json jsonb,
  draft_json jsonb,
  issues_json jsonb NOT NULL DEFAULT '[]',
  parser_version text,
  template_version text,
  error text,
  lease_token uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz,
  report_id uuid UNIQUE REFERENCES clay_shift_reports(id) ON DELETE RESTRICT,
  CONSTRAINT clay_report_import_hash_uq UNIQUE (crusher_id, sha256)
);
CREATE INDEX clay_report_import_queue_idx ON clay_report_imports(created_at) WHERE status = 'QUEUED';
CREATE INDEX clay_report_import_lease_idx ON clay_report_imports(started_at) WHERE status = 'PROCESSING';
CREATE INDEX clay_report_import_created_idx ON clay_report_imports(crusher_id, created_at DESC);
CREATE INDEX clay_report_import_actor_idx ON clay_report_imports(created_by);
CREATE INDEX clay_report_import_confirmer_idx ON clay_report_imports(confirmed_by);

CREATE TABLE clay_report_import_files (
  import_id uuid PRIMARY KEY REFERENCES clay_report_imports(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  source_bytes bytea NOT NULL CHECK (octet_length(source_bytes) BETWEEN 1 AND 8388608),
  aligned_bytes bytea
);

CREATE TABLE clay_report_import_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES clay_report_imports(id) ON DELETE CASCADE,
  parser_run integer NOT NULL,
  field_path text NOT NULL,
  observation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clay_report_import_observation_idx
  ON clay_report_import_observations(import_id, parser_run);

CREATE TABLE clay_report_import_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES clay_report_imports(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  field_path text NOT NULL,
  predicted_value jsonb,
  corrected_value jsonb,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clay_report_import_correction_idx
  ON clay_report_import_corrections(import_id, revision);
CREATE INDEX clay_report_import_correction_actor_idx
  ON clay_report_import_corrections(created_by);

ALTER TABLE clay_report_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_import_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clay_report_import_corrections ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON
  clay_report_imports,
  clay_report_import_files,
  clay_report_import_observations,
  clay_report_import_corrections
FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON clay_report_imports,clay_report_import_files,clay_report_import_observations,clay_report_import_corrections FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
