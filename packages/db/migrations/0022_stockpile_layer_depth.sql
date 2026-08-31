BEGIN;

-- Lower footprint, in percent of warehouse width (not metres).
ALTER TABLE stockpile_layers
  ADD COLUMN start_depth numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN end_depth numeric(12,4) NOT NULL DEFAULT 100;
ALTER TABLE stockpile_layer_versions
  ADD COLUMN start_depth numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN end_depth numeric(12,4) NOT NULL DEFAULT 100;

-- Preserve the existing schematic profile independently for every historic version.
UPDATE stockpile_layers layer
SET start_depth = 39 * layer.bottom_level / layout.max_level,
    end_depth = 100 - 39 * layer.bottom_level / layout.max_level
FROM stockpile_lots lot JOIN warehouse_layouts layout ON layout.id = lot.layout_id
WHERE lot.id = layer.lot_id;
UPDATE stockpile_layer_versions version
SET start_depth = 39 * version.bottom_level / layout.max_level,
    end_depth = 100 - 39 * version.bottom_level / layout.max_level
FROM stockpile_lots lot JOIN warehouse_layouts layout ON layout.id = lot.layout_id
WHERE lot.id = version.lot_id;

ALTER TABLE stockpile_layers ADD CONSTRAINT stockpile_layers_depth_check
  CHECK (start_depth >= 0 AND end_depth <= 100 AND end_depth > start_depth);
ALTER TABLE stockpile_layer_versions ADD CONSTRAINT stockpile_layer_versions_depth_check
  CHECK (start_depth >= 0 AND end_depth <= 100 AND end_depth > start_depth);
-- Existing RLS/grants remain unchanged. No Data API exposure.
COMMIT;
