BEGIN;

-- Normalize vendor aliases for migration/data-cleaning while preserving the legacy array column during transition.
CREATE TABLE IF NOT EXISTS vendor_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_aliases_normalized_uq ON vendor_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS vendor_aliases_vendor_idx ON vendor_aliases(vendor_id);
INSERT INTO vendor_aliases(vendor_id, alias, normalized_alias)
SELECT v.id, a.alias, lower(regexp_replace(trim(a.alias), '\s+', ' ', 'g'))
FROM vendors v
CROSS JOIN LATERAL unnest(v.aliases) AS a(alias)
WHERE trim(a.alias) <> ''
ON CONFLICT (normalized_alias) DO NOTHING;

-- Master tables need uniform audit timestamps before native CRUD is enabled.
ALTER TABLE plants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE plants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE crushers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE crushers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sources ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE piles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE piles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Canonical codes/unit numbers are logically case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS vendors_code_ci_uq ON vendors (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS plants_code_ci_uq ON plants (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS crushers_code_ci_uq ON crushers (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS sources_code_ci_uq ON sources (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS piles_code_ci_uq ON piles (lower(code));
CREATE UNIQUE INDEX IF NOT EXISTS equipment_vendor_type_unit_ci_uq ON equipment (vendor_id, type, lower(unit_no));

CREATE INDEX IF NOT EXISTS vendors_active_idx ON vendors(active);
CREATE INDEX IF NOT EXISTS plants_active_idx ON plants(active);
CREATE INDEX IF NOT EXISTS crushers_active_idx ON crushers(active);
CREATE INDEX IF NOT EXISTS equipment_active_idx ON equipment(active);
CREATE INDEX IF NOT EXISTS sources_active_idx ON sources(active);
CREATE INDEX IF NOT EXISTS piles_active_idx ON piles(active);
CREATE INDEX IF NOT EXISTS piles_plant_kind_idx ON piles(plant_id, material_kind);
CREATE INDEX IF NOT EXISTS sources_category_kind_idx ON sources(material_category, material_kind);

-- Keep updated_at authoritative even when a future adapter writes outside Drizzle.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendors_touch_updated_at ON vendors;
CREATE TRIGGER vendors_touch_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS plants_touch_updated_at ON plants;
CREATE TRIGGER plants_touch_updated_at BEFORE UPDATE ON plants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS crushers_touch_updated_at ON crushers;
CREATE TRIGGER crushers_touch_updated_at BEFORE UPDATE ON crushers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS equipment_touch_updated_at ON equipment;
CREATE TRIGGER equipment_touch_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS sources_touch_updated_at ON sources;
CREATE TRIGGER sources_touch_updated_at BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS piles_touch_updated_at ON piles;
CREATE TRIGGER piles_touch_updated_at BEFORE UPDATE ON piles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
