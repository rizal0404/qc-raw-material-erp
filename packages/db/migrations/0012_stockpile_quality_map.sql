BEGIN;

CREATE TYPE stockpile_lot_status AS ENUM ('ACTIVE','RECLAIMED');
CREATE TYPE stockpile_lot_no_mode AS ENUM ('PILE_CYCLE','MANUAL');
CREATE TYPE warehouse_zone_kind AS ENUM ('FILLER','HOPPER','LOADER_FEED','DIVIDER','TRACK','LABEL');

CREATE TABLE warehouse_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  material_kind material_kind NOT NULL,
  plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
  axis_length numeric(12,4) NOT NULL,
  max_level numeric(12,4) NOT NULL DEFAULT 3,
  post_marks jsonb NOT NULL DEFAULT '[]'::jsonb,
  hopper_side text NOT NULL DEFAULT 'START',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_layouts_code_uq UNIQUE(code),
  CONSTRAINT warehouse_layouts_axis_check CHECK(axis_length>0 AND max_level>0),
  CONSTRAINT warehouse_layouts_hopper_side_check CHECK(hopper_side IN ('START','END'))
);
CREATE INDEX warehouse_layouts_plant_kind_idx ON warehouse_layouts(plant_id,material_kind);

CREATE TABLE warehouse_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES warehouse_layouts(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  kind warehouse_zone_kind NOT NULL,
  start_position numeric(12,4) NOT NULL,
  end_position numeric(12,4) NOT NULL,
  bottom_level numeric(12,4) NOT NULL DEFAULT 0,
  top_level numeric(12,4) NOT NULL DEFAULT 3,
  display_order integer NOT NULL DEFAULT 0,
  CONSTRAINT warehouse_zones_layout_code_uq UNIQUE(layout_id,code),
  CONSTRAINT warehouse_zones_geometry_check CHECK(start_position>=0 AND end_position>start_position AND bottom_level>=0 AND top_level>bottom_level)
);
CREATE INDEX warehouse_zones_layout_order_idx ON warehouse_zones(layout_id,display_order);

CREATE TABLE stockpile_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES warehouse_layouts(id) ON DELETE RESTRICT,
  logical_pile_id uuid NOT NULL REFERENCES piles(id) ON DELETE RESTRICT,
  lot_no text NOT NULL,
  lot_no_mode stockpile_lot_no_mode NOT NULL DEFAULT 'PILE_CYCLE',
  pile_cycle integer NOT NULL,
  status stockpile_lot_status NOT NULL DEFAULT 'ACTIVE',
  reclaimed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stockpile_lots_business_uq UNIQUE(layout_id,lot_no,pile_cycle),
  CONSTRAINT stockpile_lots_cycle_check CHECK(pile_cycle>0 AND length(trim(lot_no))>0)
);
CREATE INDEX stockpile_lots_layout_status_idx ON stockpile_lots(layout_id,status,updated_at);
CREATE INDEX stockpile_lots_logical_pile_idx ON stockpile_lots(logical_pile_id);
CREATE INDEX stockpile_lots_created_by_idx ON stockpile_lots(created_by);
CREATE INDEX stockpile_lots_updated_by_idx ON stockpile_lots(updated_by);

CREATE TABLE stockpile_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES stockpile_lots(id) ON DELETE CASCADE,
  label text,
  start_position numeric(12,4) NOT NULL,
  end_position numeric(12,4) NOT NULL,
  bottom_level numeric(12,4) NOT NULL,
  top_level numeric(12,4) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stockpile_layers_geometry_check CHECK(start_position>=0 AND end_position>start_position AND bottom_level>=0 AND top_level>bottom_level AND version>0)
);
CREATE INDEX stockpile_layers_lot_idx ON stockpile_layers(lot_id);
CREATE INDEX stockpile_layers_created_by_idx ON stockpile_layers(created_by);
CREATE INDEX stockpile_layers_updated_by_idx ON stockpile_layers(updated_by);

CREATE TABLE stockpile_layer_mixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES stockpile_layers(id) ON DELETE CASCADE,
  mix_id uuid NOT NULL REFERENCES mixes(id) ON DELETE RESTRICT,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stockpile_layer_mixes_layer_mix_uq UNIQUE(layer_id,mix_id)
);
CREATE UNIQUE INDEX stockpile_layer_mixes_mix_uq ON stockpile_layer_mixes(mix_id);

CREATE TABLE reclaimer_position_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id uuid NOT NULL REFERENCES warehouse_layouts(id) ON DELETE RESTRICT,
  position numeric(12,4) NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reclaimer_position_nonnegative_check CHECK(position>=0)
);
CREATE INDEX reclaimer_position_layout_effective_idx ON reclaimer_position_events(layout_id,effective_at,created_at);
CREATE INDEX reclaimer_position_created_by_idx ON reclaimer_position_events(created_by);

DROP TRIGGER IF EXISTS warehouse_layouts_touch_updated_at ON warehouse_layouts;
CREATE TRIGGER warehouse_layouts_touch_updated_at BEFORE UPDATE ON warehouse_layouts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS stockpile_lots_touch_updated_at ON stockpile_lots;
CREATE TRIGGER stockpile_lots_touch_updated_at BEFORE UPDATE ON stockpile_lots FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS stockpile_layers_touch_updated_at ON stockpile_layers;
CREATE TRIGGER stockpile_layers_touch_updated_at BEFORE UPDATE ON stockpile_layers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE warehouse_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockpile_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockpile_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockpile_layer_mixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclaimer_position_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE warehouse_layouts,warehouse_zones,stockpile_lots,stockpile_layers,stockpile_layer_mixes,reclaimer_position_events FROM %I',role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO warehouse_layouts(code,name,material_kind,plant_id,axis_length,max_level,post_marks,hopper_side)
SELECT 'LS_4','Gudang Limestone 4','LS',p.id,35,3,
       (SELECT jsonb_agg(jsonb_build_object('position',g,'label',(36-g)::text) ORDER BY g) FROM generate_series(0,35) g),'START'
FROM plants p WHERE p.code='TONASA_4'
ON CONFLICT(code) DO NOTHING;

INSERT INTO warehouse_layouts(code,name,material_kind,plant_id,axis_length,max_level,post_marks,hopper_side)
SELECT 'LS_5','Gudang Limestone 5','LS',p.id,41,3,
       (SELECT jsonb_agg(jsonb_build_object('position',g,'label',(44-g)::text) ORDER BY g) FROM generate_series(0,41) g),'END'
FROM plants p WHERE p.code='TONASA_5'
ON CONFLICT(code) DO NOTHING;

INSERT INTO warehouse_layouts(code,name,material_kind,plant_id,axis_length,max_level,post_marks,hopper_side)
SELECT 'CL_4','Gudang Clay 4','CL',p.id,17,3,
       (SELECT jsonb_agg(jsonb_build_object('position',g,'label',(CASE WHEN g<=8 THEN 9-g ELSE 18-g END)::text) ORDER BY g) FROM generate_series(0,17) g),'START'
FROM plants p WHERE p.code='TONASA_4'
ON CONFLICT(code) DO NOTHING;

INSERT INTO warehouse_layouts(code,name,material_kind,plant_id,axis_length,max_level,post_marks,hopper_side)
SELECT 'CL_5','Gudang Clay 5','CL',p.id,17,3,
       (SELECT jsonb_agg(jsonb_build_object('position',g,'label',(CASE WHEN g<=8 THEN 9-g WHEN g=9 THEN 0 ELSE 18-g END)::text) ORDER BY g) FROM generate_series(0,17) g),'END'
FROM plants p WHERE p.code='TONASA_5'
ON CONFLICT(code) DO NOTHING;

INSERT INTO warehouse_zones(layout_id,code,label,kind,start_position,end_position,bottom_level,top_level,display_order)
SELECT id,'FILLER','FILLER','FILLER',30,35,0,3,10 FROM warehouse_layouts WHERE code='LS_4'
ON CONFLICT(layout_id,code) DO NOTHING;
INSERT INTO warehouse_zones(layout_id,code,label,kind,start_position,end_position,bottom_level,top_level,display_order)
SELECT id,'DIVIDER','BATAS PILE','DIVIDER',18,22,0,3,10 FROM warehouse_layouts WHERE code='LS_5'
ON CONFLICT(layout_id,code) DO NOTHING;
INSERT INTO warehouse_zones(layout_id,code,label,kind,start_position,end_position,bottom_level,top_level,display_order)
SELECT id,'LOADER_FEED','UMPAN LOADER','LOADER_FEED',0,3,0,3,10 FROM warehouse_layouts WHERE code='CL_4'
ON CONFLICT(layout_id,code) DO NOTHING;
INSERT INTO warehouse_zones(layout_id,code,label,kind,start_position,end_position,bottom_level,top_level,display_order)
SELECT id,'DIVIDER','BATAS PILE','DIVIDER',8.7,9.3,0,3,10 FROM warehouse_layouts WHERE code='CL_5'
ON CONFLICT(layout_id,code) DO NOTHING;

COMMIT;
