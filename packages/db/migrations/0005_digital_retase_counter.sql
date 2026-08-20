BEGIN;

ALTER TABLE retase_events
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES vendor_shift_reports(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS report_version integer,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES sources(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS block_snapshot text,
  ADD COLUMN IF NOT EXISTS material_kind material_kind,
  ADD COLUMN IF NOT EXISTS material_category text,
  ADD COLUMN IF NOT EXISTS vendor_name_snapshot text,
  ADD COLUMN IF NOT EXISTS am_unit_no_snapshot text,
  ADD COLUMN IF NOT EXISTS aa_unit_no_snapshot text;

CREATE INDEX IF NOT EXISTS retase_actor_recent_idx
  ON retase_events(created_by, operation_date, shift_code, crusher_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS retase_report_idx
  ON retase_events(report_id, event_ts);
CREATE INDEX IF NOT EXISTS retase_status_context_idx
  ON retase_events(operation_date, shift_code, crusher_id, status, event_ts DESC);

-- Every recorded dump must preserve a visible AA identifier snapshot when known.
ALTER TABLE retase_events DROP CONSTRAINT IF EXISTS retase_aa_snapshot_ck;
ALTER TABLE retase_events ADD CONSTRAINT retase_aa_snapshot_ck CHECK (
  event_type = 'REVERSAL' OR aa_id IS NOT NULL OR length(trim(coalesce(aa_unit_no_snapshot,''))) > 0
) NOT VALID;

-- Reversal remains append-only: original event is retained and marked REVERSED,
-- while a separate -1 event references it. Existing unique index prevents double reversal.

COMMIT;
