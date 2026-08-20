-- Operational assignments allow Counter activity before/without a Vendor Shift Report.
-- Existing report-backed assignments remain unchanged and are explicitly marked.
ALTER TABLE loading_assignments
  ALTER COLUMN report_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS assignment_origin text NOT NULL DEFAULT 'SHIFT_REPORT',
  ADD COLUMN IF NOT EXISTS pile_id uuid REFERENCES piles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE RESTRICT;

UPDATE loading_assignments la
SET created_by = coalesce(la.created_by, r.created_by),
    updated_by = coalesce(la.updated_by, r.updated_by, r.created_by),
    assignment_origin = 'SHIFT_REPORT'
FROM vendor_shift_reports r
WHERE r.id = la.report_id;

ALTER TABLE loading_assignments
  DROP CONSTRAINT IF EXISTS loading_assignment_origin_ck,
  ADD CONSTRAINT loading_assignment_origin_ck CHECK (assignment_origin IN ('SHIFT_REPORT','OPERATIONAL'));

CREATE INDEX IF NOT EXISTS loading_assignment_operational_idx
  ON loading_assignments(assignment_origin, operation_date, shift_code, vendor_id, status);

ALTER TABLE retase_events
  ADD COLUMN IF NOT EXISTS assignment_origin text,
  ADD COLUMN IF NOT EXISTS pile_id uuid REFERENCES piles(id) ON DELETE RESTRICT;

UPDATE retase_events re
SET assignment_origin = la.assignment_origin,
    pile_id = la.pile_id
FROM loading_assignments la
WHERE la.id = re.assignment_id;

ALTER TABLE retase_events
  DROP CONSTRAINT IF EXISTS retase_event_assignment_origin_ck,
  ADD CONSTRAINT retase_event_assignment_origin_ck CHECK (assignment_origin IS NULL OR assignment_origin IN ('SHIFT_REPORT','OPERATIONAL'));
