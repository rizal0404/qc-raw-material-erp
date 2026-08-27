BEGIN;

CREATE TABLE vendor_material_scopes (
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  material_kind material_kind NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_material_scopes_pk PRIMARY KEY (vendor_id, material_kind)
);

CREATE TABLE equipment_material_scopes (
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  material_kind material_kind NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_material_scopes_pk PRIMARY KEY (equipment_id, material_kind)
);

CREATE TABLE plant_material_scopes (
  plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  material_kind material_kind NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plant_material_scopes_pk PRIMARY KEY (plant_id, material_kind)
);

CREATE INDEX vendor_material_scope_kind_idx ON vendor_material_scopes(material_kind, active);
CREATE INDEX equipment_material_scope_kind_idx ON equipment_material_scopes(material_kind, active);
CREATE INDEX plant_material_scope_kind_idx ON plant_material_scopes(material_kind, active);

INSERT INTO vendor_material_scopes(vendor_id, material_kind)
SELECT DISTINCT vendor_id, material_kind FROM loading_assignments
ON CONFLICT DO NOTHING;
INSERT INTO vendor_material_scopes(vendor_id, material_kind)
SELECT DISTINCT vendor_id, material_kind FROM raw_samples WHERE vendor_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO vendor_material_scopes(vendor_id, material_kind)
SELECT v.id, k.kind
FROM vendors v CROSS JOIN (VALUES ('LS'::material_kind), ('CL'::material_kind)) k(kind)
WHERE NOT EXISTS (SELECT 1 FROM vendor_material_scopes s WHERE s.vendor_id=v.id)
ON CONFLICT DO NOTHING;

INSERT INTO equipment_material_scopes(equipment_id, material_kind)
SELECT DISTINCT am_id, material_kind FROM loading_assignments
ON CONFLICT DO NOTHING;
INSERT INTO equipment_material_scopes(equipment_id, material_kind)
SELECT DISTINCT laa.aa_id, la.material_kind
FROM loading_assignment_aas laa JOIN loading_assignments la ON la.id=laa.assignment_id
ON CONFLICT DO NOTHING;
INSERT INTO equipment_material_scopes(equipment_id, material_kind)
SELECT e.id, k.kind
FROM equipment e CROSS JOIN (VALUES ('LS'::material_kind), ('CL'::material_kind)) k(kind)
WHERE NOT EXISTS (SELECT 1 FROM equipment_material_scopes s WHERE s.equipment_id=e.id)
ON CONFLICT DO NOTHING;

INSERT INTO plant_material_scopes(plant_id, material_kind)
SELECT DISTINCT plant_id, material_kind FROM crushers WHERE plant_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO plant_material_scopes(plant_id, material_kind)
SELECT DISTINCT plant_id, material_kind FROM piles WHERE plant_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO plant_material_scopes(plant_id, material_kind)
SELECT DISTINCT rs.plant_id, rs.material_kind FROM raw_samples rs WHERE rs.plant_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO plant_material_scopes(plant_id, material_kind)
SELECT p.id, k.kind
FROM plants p CROSS JOIN (VALUES ('LS'::material_kind), ('CL'::material_kind)) k(kind)
WHERE NOT EXISTS (SELECT 1 FROM plant_material_scopes s WHERE s.plant_id=p.id)
ON CONFLICT DO NOTHING;

ALTER TABLE vendor_shift_reports ADD COLUMN material_kind material_kind;
UPDATE vendor_shift_reports r
SET material_kind=coalesce((
  SELECT min(la.material_kind::text)::material_kind FROM loading_assignments la WHERE la.report_id=r.id
), 'LS'::material_kind);
ALTER TABLE vendor_shift_reports ALTER COLUMN material_kind SET NOT NULL;
ALTER TABLE vendor_shift_reports ALTER COLUMN material_kind SET DEFAULT 'LS';
INSERT INTO vendor_material_scopes(vendor_id, material_kind)
SELECT DISTINCT vendor_id, material_kind FROM vendor_shift_reports
ON CONFLICT DO NOTHING;

DROP INDEX IF EXISTS vendor_shift_report_version_uq;
DROP INDEX IF EXISTS vendor_shift_current_idx;
CREATE UNIQUE INDEX vendor_shift_report_version_uq ON vendor_shift_reports(operation_date, shift_code, material_kind, vendor_id, version);
CREATE INDEX vendor_shift_current_idx ON vendor_shift_reports(operation_date, shift_code, material_kind, vendor_id, status);

DROP INDEX IF EXISTS sources_code_uq;
DROP INDEX IF EXISTS piles_code_uq;
CREATE UNIQUE INDEX sources_kind_code_uq ON sources(material_kind, code);
CREATE UNIQUE INDEX piles_kind_code_uq ON piles(material_kind, code);

CREATE UNIQUE INDEX crushers_id_kind_uq ON crushers(id, material_kind);
CREATE UNIQUE INDEX sources_id_kind_uq ON sources(id, material_kind);
CREATE UNIQUE INDEX piles_id_kind_uq ON piles(id, material_kind);
CREATE UNIQUE INDEX vendor_shift_reports_id_kind_uq ON vendor_shift_reports(id, material_kind);
CREATE UNIQUE INDEX loading_assignments_id_kind_uq ON loading_assignments(id, material_kind);

ALTER TABLE loading_assignment_aas ADD COLUMN material_kind material_kind;
UPDATE loading_assignment_aas laa SET material_kind=la.material_kind FROM loading_assignments la WHERE la.id=laa.assignment_id;
ALTER TABLE loading_assignment_aas ALTER COLUMN material_kind SET NOT NULL;

ALTER TABLE vendor_shift_reports
  ADD CONSTRAINT vendor_shift_report_vendor_scope_fk FOREIGN KEY (vendor_id, material_kind)
  REFERENCES vendor_material_scopes(vendor_id, material_kind) ON DELETE RESTRICT NOT VALID;
ALTER TABLE loading_assignments
  ADD CONSTRAINT loading_assignment_vendor_scope_fk FOREIGN KEY (vendor_id, material_kind)
  REFERENCES vendor_material_scopes(vendor_id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT loading_assignment_am_scope_fk FOREIGN KEY (am_id, material_kind)
  REFERENCES equipment_material_scopes(equipment_id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT loading_assignment_crusher_kind_fk FOREIGN KEY (crusher_id, material_kind)
  REFERENCES crushers(id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT loading_assignment_source_kind_fk FOREIGN KEY (source_id, material_kind)
  REFERENCES sources(id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT loading_assignment_pile_kind_fk FOREIGN KEY (pile_id, material_kind)
  REFERENCES piles(id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT loading_assignment_report_kind_fk FOREIGN KEY (report_id, material_kind)
  REFERENCES vendor_shift_reports(id, material_kind) ON DELETE CASCADE NOT VALID;
ALTER TABLE loading_assignment_aas
  ADD CONSTRAINT loading_assignment_aa_assignment_kind_fk FOREIGN KEY (assignment_id, material_kind)
  REFERENCES loading_assignments(id, material_kind) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT loading_assignment_aa_equipment_scope_fk FOREIGN KEY (aa_id, material_kind)
  REFERENCES equipment_material_scopes(equipment_id, material_kind) ON DELETE RESTRICT NOT VALID;
ALTER TABLE crushers
  ADD CONSTRAINT crusher_plant_scope_fk FOREIGN KEY (plant_id, material_kind)
  REFERENCES plant_material_scopes(plant_id, material_kind) ON DELETE RESTRICT NOT VALID;
ALTER TABLE piles
  ADD CONSTRAINT pile_plant_scope_fk FOREIGN KEY (plant_id, material_kind)
  REFERENCES plant_material_scopes(plant_id, material_kind) ON DELETE RESTRICT NOT VALID;
ALTER TABLE raw_samples
  ADD CONSTRAINT raw_sample_vendor_scope_fk FOREIGN KEY (vendor_id, material_kind)
  REFERENCES vendor_material_scopes(vendor_id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT raw_sample_source_kind_fk FOREIGN KEY (source_id, material_kind)
  REFERENCES sources(id, material_kind) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT raw_sample_plant_scope_fk FOREIGN KEY (plant_id, material_kind)
  REFERENCES plant_material_scopes(plant_id, material_kind) ON DELETE RESTRICT NOT VALID;

ALTER TABLE vendor_shift_reports VALIDATE CONSTRAINT vendor_shift_report_vendor_scope_fk;
ALTER TABLE loading_assignments VALIDATE CONSTRAINT loading_assignment_vendor_scope_fk;
ALTER TABLE loading_assignments VALIDATE CONSTRAINT loading_assignment_am_scope_fk;
ALTER TABLE loading_assignments VALIDATE CONSTRAINT loading_assignment_crusher_kind_fk;
ALTER TABLE loading_assignments VALIDATE CONSTRAINT loading_assignment_source_kind_fk;
ALTER TABLE loading_assignments VALIDATE CONSTRAINT loading_assignment_pile_kind_fk;
-- Historical reports may contain mixed material assignments. The NOT VALID FK still
-- enforces all new/updated rows; historical cleanup can validate it in a later migration.
ALTER TABLE loading_assignment_aas VALIDATE CONSTRAINT loading_assignment_aa_assignment_kind_fk;
ALTER TABLE loading_assignment_aas VALIDATE CONSTRAINT loading_assignment_aa_equipment_scope_fk;
ALTER TABLE crushers VALIDATE CONSTRAINT crusher_plant_scope_fk;
ALTER TABLE piles VALIDATE CONSTRAINT pile_plant_scope_fk;
ALTER TABLE raw_samples VALIDATE CONSTRAINT raw_sample_vendor_scope_fk;
ALTER TABLE raw_samples VALIDATE CONSTRAINT raw_sample_source_kind_fk;
ALTER TABLE raw_samples VALIDATE CONSTRAINT raw_sample_plant_scope_fk;

ALTER TABLE vendor_material_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_material_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plant_material_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON vendor_material_scopes, equipment_material_scopes, plant_material_scopes FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON vendor_material_scopes, equipment_material_scopes, plant_material_scopes FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
