BEGIN;


ALTER TABLE retase_events
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason text;
CREATE INDEX IF NOT EXISTS retase_resolution_idx ON retase_events(operation_date, status, resolved_at);
ALTER TABLE retase_events DROP CONSTRAINT IF EXISTS retase_resolution_shape_ck;
ALTER TABLE retase_events ADD CONSTRAINT retase_resolution_shape_ck CHECK ((resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL) OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_reason IS NOT NULL)) NOT VALID;

ALTER TABLE qc_retase_allocations
  ADD COLUMN IF NOT EXISTS consumed_retase integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE qc_retase_allocations DROP CONSTRAINT IF EXISTS qc_alloc_consumed_shape_ck;
ALTER TABLE qc_retase_allocations ADD CONSTRAINT qc_alloc_consumed_shape_ck CHECK (
  (mapping_status <> 'CONSUMED') OR
  (mix_id IS NOT NULL AND consumed_at IS NOT NULL AND approved_retase IS NOT NULL AND consumed_retase > 0)
) NOT VALID;
ALTER TABLE qc_retase_allocations DROP CONSTRAINT IF EXISTS qc_alloc_consumed_retase_ck;
ALTER TABLE qc_retase_allocations ADD CONSTRAINT qc_alloc_consumed_retase_ck CHECK (consumed_retase >= 0) NOT VALID;
ALTER TABLE qc_retase_allocations DROP CONSTRAINT IF EXISTS qc_alloc_candidate_count_ck;
ALTER TABLE qc_retase_allocations ADD CONSTRAINT qc_alloc_candidate_count_ck CHECK (candidate_count >= 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS qc_alloc_open_assignment_sample_uq
  ON qc_retase_allocations(assignment_id, sample_id)
  WHERE sample_id IS NOT NULL AND mapping_status IN ('SUGGESTED','AMBIGUOUS','CONFIRMED','REVIEW_REQUIRED');
CREATE INDEX IF NOT EXISTS qc_alloc_reconciliation_idx ON qc_retase_allocations(operation_date, shift_code, crusher_id, mapping_status, review_required);
CREATE INDEX IF NOT EXISTS qc_alloc_mix_idx ON qc_retase_allocations(mix_id) WHERE mix_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS qc_retase_allocation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES qc_retase_allocations(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES retase_events(id) ON DELETE RESTRICT,
  mix_item_id uuid REFERENCES mix_items(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  bound_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS qc_alloc_event_active_once_uq ON qc_retase_allocation_events(event_id) WHERE active=true;
CREATE INDEX IF NOT EXISTS qc_alloc_event_allocation_idx ON qc_retase_allocation_events(allocation_id);
CREATE INDEX IF NOT EXISTS qc_alloc_event_mix_item_idx ON qc_retase_allocation_events(mix_item_id);

CREATE TABLE IF NOT EXISTS mix_item_retase_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_item_id uuid NOT NULL REFERENCES mix_items(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES qc_retase_allocations(id) ON DELETE RESTRICT,
  retase_consumed integer NOT NULL CHECK (retase_consumed > 0),
  override_reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS mix_item_allocation_active_once_uq ON mix_item_retase_allocations(allocation_id) WHERE active=true;
CREATE INDEX IF NOT EXISTS mix_item_allocation_mix_idx ON mix_item_retase_allocations(mix_item_id);

-- Existing singular source_retase_allocation_id is retained for compatibility only.
-- New native code uses the bridge table so a sample may consume multiple allocations.
COMMIT;
