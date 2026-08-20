BEGIN;

DO $$ BEGIN CREATE TYPE ton_per_retase_rule_type AS ENUM ('DEFAULT','MATCH_KEY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Raw sample parity with legacy 10_DB_LIMESTONE / 11_DB_CLAY columns.
ALTER TABLE raw_samples ADD COLUMN IF NOT EXISTS source_shift text;
ALTER TABLE raw_samples ADD COLUMN IF NOT EXISTS loader_unit_no text;
ALTER TABLE raw_samples ADD COLUMN IF NOT EXISTS block text;
ALTER TABLE raw_samples ADD COLUMN IF NOT EXISTS direction text;
CREATE INDEX IF NOT EXISTS raw_samples_source_date_idx ON raw_samples(source_id, sample_date);
CREATE UNIQUE INDEX IF NOT EXISTS raw_samples_sample_id_ci_uq ON raw_samples(lower(sample_id));
DROP TRIGGER IF EXISTS raw_samples_touch_updated_at ON raw_samples;
CREATE TRIGGER raw_samples_touch_updated_at BEFORE UPDATE ON raw_samples FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- Legacy master parity seed from 01_MASTER. Safe/idempotent canonical codes.
INSERT INTO plants(code,name,active) VALUES
 ('TONASA_23','Tonasa 2.3',true),('TONASA_4','Tonasa 4',true),('TONASA_5','Tonasa 5',true)
ON CONFLICT DO NOTHING;

UPDATE crushers c SET plant_id=p.id
FROM plants p
WHERE (c.code='CR_LS_23' AND p.code='TONASA_23')
   OR (c.code IN ('CR_LS_4','CR_CY_4') AND p.code='TONASA_4')
   OR (c.code IN ('CR_LS_5','CR_CY_5') AND p.code='TONASA_5');

WITH seed(code,name,kind,plant_code,class_name) AS (VALUES
 ('LS_23_FILLER_SELATAN','Sblh Selatan Gdg 2.3(Filler)','LS','TONASA_23','Filler'),
 ('LS_23_FILLER_UTARA','Sblh Utara Gdg 2.3(Filler)','LS','TONASA_23','Filler'),
 ('LS_4_PILE_TIMUR','Pile Timur Gdg 4','LS','TONASA_4','Timur'),
 ('LS_4_PILE_BARAT','Pile Barat Gdg 4','LS','TONASA_4','Barat'),
 ('LS_4_FILLER_BARAT','Sblh Barat Gdg 4 (Filler)','LS','TONASA_4','Filler'),
 ('LS_4_FILLER_TIMUR','Sblh Timur Gdg 4 (Filler)','LS','TONASA_4','Filler'),
 ('LS_5_PILE_TIMUR','Pile Timur Gdg 5','LS','TONASA_5','Timur'),
 ('LS_5_PILE_BARAT','Pile Barat Gdg 5','LS','TONASA_5','Barat'),
 ('LS_5_FILLER_BARAT','Sblh Barat Gdg 5 (Filler)','LS','TONASA_5','Filler'),
 ('LS_5_FILLER_TIMUR','Sblh Timur Gdg 5 (Filler)','LS','TONASA_5','Filler'),
 ('CL_23_PILE_UTARA','Pile Utara Gdg 2.3','CL','TONASA_23','Utara'),
 ('CL_23_PILE_SELATAN','Pile Selatan Gdg 2.3','CL','TONASA_23','Selatan'),
 ('CL_4_PILE_UTARA','Pile Utara Gdg 4','CL','TONASA_4','Utara'),
 ('CL_4_PILE_SELATAN','Pile Selatan Gdg 4','CL','TONASA_4','Selatan'),
 ('CL_5_PILE_UTARA','Pile Utara Gdg 5','CL','TONASA_5','Utara'),
 ('CL_5_PILE_SELATAN','Pile Selatan Gdg 5','CL','TONASA_5','Selatan')
)
INSERT INTO piles(code,name,material_kind,plant_id,class_name,active)
SELECT s.code,s.name,s.kind::material_kind,p.id,s.class_name,true FROM seed s JOIN plants p ON p.code=s.plant_code
ON CONFLICT DO NOTHING;

-- Configurable Ton/Retase rule engine. MATCH_KEY preserves V2.8 Clay matching against Vendor OR Source.
CREATE TABLE IF NOT EXISTS ton_per_retase_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_kind material_kind NOT NULL,
  rule_type ton_per_retase_rule_type NOT NULL,
  match_key text,
  normalized_match_key text,
  rate numeric(12,4) NOT NULL CHECK (rate > 0),
  priority integer NOT NULL DEFAULT 100,
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ton_per_retase_rule_shape_ck CHECK (
    (rule_type='DEFAULT' AND match_key IS NULL AND normalized_match_key IS NULL)
    OR (rule_type='MATCH_KEY' AND match_key IS NOT NULL AND normalized_match_key IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ton_per_retase_lookup_idx ON ton_per_retase_rules(material_kind, active, priority);
CREATE UNIQUE INDEX IF NOT EXISTS ton_per_retase_default_uq ON ton_per_retase_rules(material_kind) WHERE rule_type='DEFAULT' AND active=true;
CREATE UNIQUE INDEX IF NOT EXISTS ton_per_retase_match_key_uq ON ton_per_retase_rules(material_kind, normalized_match_key) WHERE rule_type='MATCH_KEY' AND active=true;
DROP TRIGGER IF EXISTS ton_per_retase_touch_updated_at ON ton_per_retase_rules;
CREATE TRIGGER ton_per_retase_touch_updated_at BEFORE UPDATE ON ton_per_retase_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO ton_per_retase_rules(material_kind, rule_type, rate, priority)
VALUES ('LS','DEFAULT',25,1000), ('CL','DEFAULT',25,1000)
ON CONFLICT DO NOTHING;

-- Legacy Clay P:Q key/rate rules, ordered before DEFAULT. These are intentionally key-based,
-- because V2.8 matches each key against either Vendor or Source using equality/substring logic.
WITH seed(match_key, rate, priority) AS (VALUES
 ('Bumi Pangkep',30.0,10), ('Taruna Abadi',32.0,20), ('Mannessa Macora',32.0,30), ('Prasetya Jafar',32.0,40),
 ('Topabiring',30.0,50), ('PKM',24.0,60), ('AnNur',27.0,70), ('Buffer Clay',17.0,80), ('Buffer OB',17.0,90),
 ('Buffer MIX',17.0,100), ('PKM (30 t)',30.0,110), ('FABA',15.0,120), ('Kopkar',27.0,130), ('Silika low',28.0,140)
)
INSERT INTO ton_per_retase_rules(material_kind, rule_type, match_key, normalized_match_key, rate, priority)
SELECT 'CL','MATCH_KEY',match_key,lower(regexp_replace(trim(match_key),'\s+',' ','g')),rate,priority FROM seed
ON CONFLICT DO NOTHING;

-- QAF target hardening. Existing table remains configuration source.
ALTER TABLE quality_targets ADD COLUMN IF NOT EXISTS r2o3_max numeric(12,4);
ALTER TABLE quality_targets ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;
ALTER TABLE quality_targets ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE quality_targets ADD COLUMN IF NOT EXISTS effective_to date;
CREATE INDEX IF NOT EXISTS quality_target_lookup_idx ON quality_targets(material_kind, plant_id, class_name, active);

-- Seed legacy baseline only when no corresponding generic target exists.
INSERT INTO quality_targets(material_kind,class_name,lsf_min,lsf_max,r2o3_max,priority,active)
SELECT 'LS','PILE',1100,5000,3,100,true
WHERE NOT EXISTS (SELECT 1 FROM quality_targets WHERE material_kind='LS' AND class_name='PILE' AND plant_id IS NULL AND active=true);
INSERT INTO quality_targets(material_kind,class_name,lsf_min,lsf_max,r2o3_max,priority,active)
SELECT 'LS','Filler',2000,5000,3,90,true
WHERE NOT EXISTS (SELECT 1 FROM quality_targets WHERE material_kind='LS' AND class_name='Filler' AND plant_id IS NULL AND active=true);
INSERT INTO quality_targets(material_kind,class_name,sm_min,sm_max,am_min,am_max,priority,active)
SELECT 'CL','ALL',2.30,2.80,1.40,2.00,100,true
WHERE NOT EXISTS (SELECT 1 FROM quality_targets WHERE material_kind='CL' AND class_name='ALL' AND plant_id IS NULL AND active=true);

-- Native mix header parity / historical replacement support.
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS plant_id uuid REFERENCES plants(id) ON DELETE RESTRICT;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS class_name_snapshot text;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS batch_no integer;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS tiang_ke text;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE mixes ALTER COLUMN pile_id SET NOT NULL;
ALTER TABLE mixes DROP CONSTRAINT IF EXISTS mixes_mix_code_key;
DROP INDEX IF EXISTS mixes_code_uq;
CREATE UNIQUE INDEX IF NOT EXISTS mixes_active_code_uq ON mixes(lower(mix_code)) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS mixes_pile_cycle_idx ON mixes(pile_id,pile_cycle,operation_date);
-- Best-effort backfill for databases that already contain pre-Slice-03 test mixes.
-- The CHECK is added NOT VALID: new/updated rows are enforced immediately, while legacy rows can be cleaned then validated in a later migration.
UPDATE mixes
SET batch_no = NULLIF(regexp_replace(location_ref,'[^0-9]','','g'),'')::integer
WHERE material_kind='LS' AND batch_no IS NULL AND location_ref ~ '[0-9]';
UPDATE mixes
SET tiang_ke = NULLIF(trim(location_ref),'')
WHERE material_kind='CL' AND tiang_ke IS NULL AND trim(coalesce(location_ref,'')) <> '';

ALTER TABLE mixes DROP CONSTRAINT IF EXISTS mixes_location_shape_ck;
ALTER TABLE mixes ADD CONSTRAINT mixes_location_shape_ck CHECK (
  (material_kind='LS' AND batch_no IS NOT NULL AND batch_no > 0 AND tiang_ke IS NULL)
  OR (material_kind='CL' AND tiang_ke IS NOT NULL AND trim(tiang_ke) <> '' AND batch_no IS NULL)
) NOT VALID;
DROP TRIGGER IF EXISTS mixes_touch_updated_at ON mixes;
CREATE TRIGGER mixes_touch_updated_at BEFORE UPDATE ON mixes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE mix_items ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS mix_items_touch_updated_at ON mix_items;
CREATE TRIGGER mix_items_touch_updated_at BEFORE UPDATE ON mix_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE mix_item_chemistry_revisions ADD COLUMN IF NOT EXISTS revision_no integer;
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY mix_item_id ORDER BY changed_at,id)::int AS rn
  FROM mix_item_chemistry_revisions
)
UPDATE mix_item_chemistry_revisions r SET revision_no=n.rn FROM numbered n WHERE r.id=n.id AND r.revision_no IS NULL;
ALTER TABLE mix_item_chemistry_revisions ALTER COLUMN revision_no SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mix_item_revision_no_uq ON mix_item_chemistry_revisions(mix_item_id,revision_no);

-- Canonical derived summary view. Source of truth remains mixes + mix_items.
CREATE OR REPLACE VIEW v_mix_summary AS
WITH item_values AS (
  SELECT m.id AS mix_id, m.mix_code, m.material_kind, m.operation_date, m.pile_id, m.plant_id,
         m.class_name_snapshot, m.shift_code, m.location_ref, m.pile_cycle, m.created_at,
         mi.tonnage::numeric AS tonnage, mi.note,
         NULLIF(mi.chemistry_snapshot->>'sio2','')::numeric AS sio2,
         NULLIF(mi.chemistry_snapshot->>'al2o3','')::numeric AS al2o3,
         NULLIF(mi.chemistry_snapshot->>'fe2o3','')::numeric AS fe2o3,
         NULLIF(mi.chemistry_snapshot->>'cao','')::numeric AS cao,
         NULLIF(mi.chemistry_snapshot->>'mgo','')::numeric AS mgo,
         NULLIF(mi.chemistry_snapshot->>'k2o','')::numeric AS k2o,
         NULLIF(mi.chemistry_snapshot->>'na2o','')::numeric AS na2o,
         NULLIF(mi.chemistry_snapshot->>'so3','')::numeric AS so3,
         NULLIF(mi.chemistry_snapshot->>'h2o','')::numeric AS h2o
  FROM mixes m JOIN mix_items mi ON mi.mix_id=m.id
  WHERE m.status='ACTIVE'
), agg AS (
  SELECT mix_id,mix_code,material_kind,operation_date,pile_id,plant_id,class_name_snapshot,shift_code,location_ref,pile_cycle,created_at,
         sum(tonnage) AS total_ton,
         CASE WHEN count(sio2)>0 THEN sum(tonnage*sio2)/NULLIF(sum(tonnage),0) ELSE NULL END AS sio2,
         CASE WHEN count(al2o3)>0 THEN sum(tonnage*al2o3)/NULLIF(sum(tonnage),0) ELSE NULL END AS al2o3,
         CASE WHEN count(fe2o3)>0 THEN sum(tonnage*fe2o3)/NULLIF(sum(tonnage),0) ELSE NULL END AS fe2o3,
         CASE WHEN count(cao)>0 THEN sum(tonnage*cao)/NULLIF(sum(tonnage),0) ELSE NULL END AS cao,
         CASE WHEN count(mgo)>0 THEN sum(tonnage*mgo)/NULLIF(sum(tonnage),0) ELSE NULL END AS mgo,
         CASE WHEN count(k2o)>0 THEN sum(tonnage*k2o)/NULLIF(sum(tonnage),0) ELSE NULL END AS k2o,
         CASE WHEN count(na2o)>0 THEN sum(tonnage*na2o)/NULLIF(sum(tonnage),0) ELSE NULL END AS na2o,
         CASE WHEN count(so3)>0 THEN sum(tonnage*so3)/NULLIF(sum(tonnage),0) ELSE NULL END AS so3,
         CASE WHEN count(h2o)>0 THEN sum(tonnage*h2o)/NULLIF(sum(tonnage),0) ELSE NULL END AS h2o,
         string_agg(DISTINCT note,' | ') FILTER (WHERE note IS NOT NULL AND trim(note)<>'') AS notes
  FROM item_values GROUP BY mix_id,mix_code,material_kind,operation_date,pile_id,plant_id,class_name_snapshot,shift_code,location_ref,pile_cycle,created_at
)
SELECT a.*, p.code AS pile_code,p.name AS pile_name,pl.code AS plant_code,pl.name AS plant_name,
       CASE WHEN a.cao IS NULL OR a.sio2 IS NULL OR a.al2o3 IS NULL OR a.fe2o3 IS NULL OR (2.8*a.sio2+1.18*a.al2o3+0.65*a.fe2o3)=0 THEN NULL ELSE 100*a.cao/(2.8*a.sio2+1.18*a.al2o3+0.65*a.fe2o3) END AS lsf,
       CASE WHEN a.sio2 IS NULL OR a.al2o3 IS NULL OR a.fe2o3 IS NULL OR (a.al2o3+a.fe2o3)=0 THEN NULL ELSE a.sio2/(a.al2o3+a.fe2o3) END AS sm,
       CASE WHEN a.al2o3 IS NULL OR a.fe2o3 IS NULL OR a.fe2o3=0 THEN NULL ELSE a.al2o3/a.fe2o3 END AS am,
       CASE WHEN a.na2o IS NULL OR a.k2o IS NULL THEN NULL ELSE a.na2o+0.658*a.k2o END AS naeq,
       CASE WHEN a.sio2 IS NULL OR a.al2o3 IS NULL OR a.fe2o3 IS NULL THEN NULL ELSE a.sio2+a.al2o3+a.fe2o3 END AS r2o3
FROM agg a
JOIN piles p ON p.id=a.pile_id
LEFT JOIN plants pl ON pl.id=a.plant_id;

COMMIT;
