CREATE TABLE stockpile_lot_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES stockpile_lots(id) ON DELETE CASCADE,
  layout_id uuid NOT NULL REFERENCES warehouse_layouts(id) ON DELETE RESTRICT,
  logical_pile_id uuid NOT NULL REFERENCES piles(id) ON DELETE RESTRICT,
  lot_no text NOT NULL,
  lot_no_mode stockpile_lot_no_mode NOT NULL,
  pile_cycle integer NOT NULL,
  status stockpile_lot_status NOT NULL,
  reclaimed_at timestamptz,
  effective_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX stockpile_lot_versions_layout_effective_idx
  ON stockpile_lot_versions(layout_id, effective_at DESC);
CREATE INDEX stockpile_lot_versions_lot_effective_idx
  ON stockpile_lot_versions(lot_id, effective_at DESC);

CREATE TABLE stockpile_layer_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id uuid NOT NULL REFERENCES stockpile_layers(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES stockpile_lots(id) ON DELETE CASCADE,
  label text,
  start_position numeric(12,4) NOT NULL,
  end_position numeric(12,4) NOT NULL,
  bottom_level numeric(12,4) NOT NULL,
  top_level numeric(12,4) NOT NULL,
  version integer NOT NULL,
  mix_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT stockpile_layer_versions_geometry_check CHECK (
    start_position >= 0 AND end_position > start_position
    AND bottom_level >= 0 AND top_level > bottom_level AND version > 0
  ),
  CONSTRAINT stockpile_layer_versions_mix_ids_check CHECK (jsonb_typeof(mix_ids) = 'array')
);

CREATE INDEX stockpile_layer_versions_layer_effective_idx
  ON stockpile_layer_versions(layer_id, effective_at DESC);
CREATE INDEX stockpile_layer_versions_lot_effective_idx
  ON stockpile_layer_versions(lot_id, effective_at DESC);

INSERT INTO stockpile_lot_versions (
  lot_id, layout_id, logical_pile_id, lot_no, lot_no_mode, pile_cycle,
  status, reclaimed_at, effective_at, changed_by
)
SELECT
  id, layout_id, logical_pile_id, lot_no, lot_no_mode, pile_cycle,
  status, reclaimed_at, updated_at, coalesce(updated_by, created_by)
FROM stockpile_lots;

INSERT INTO stockpile_layer_versions (
  layer_id, lot_id, label, start_position, end_position, bottom_level,
  top_level, version, mix_ids, effective_at, changed_by
)
SELECT
  layer.id,
  layer.lot_id,
  layer.label,
  layer.start_position,
  layer.end_position,
  layer.bottom_level,
  layer.top_level,
  layer.version,
  coalesce(
    jsonb_agg(to_jsonb(layer_mix.mix_id) ORDER BY layer_mix.display_order)
      FILTER (WHERE layer_mix.mix_id IS NOT NULL),
    '[]'::jsonb
  ),
  layer.updated_at,
  coalesce(layer.updated_by, layer.created_by)
FROM stockpile_layers layer
LEFT JOIN stockpile_layer_mixes layer_mix ON layer_mix.layer_id = layer.id
GROUP BY layer.id;

ALTER TABLE stockpile_lot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stockpile_layer_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE stockpile_lot_versions FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE stockpile_layer_versions FROM anon, authenticated, service_role;
