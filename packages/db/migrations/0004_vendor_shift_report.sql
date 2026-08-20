-- Slice 04 — Vendor Shift Report hardening
-- v0.5.0

ALTER TYPE shift_report_status ADD VALUE IF NOT EXISTS 'SUPERSEDED';

ALTER TABLE vendor_shift_reports
  ADD COLUMN IF NOT EXISTS revises_report_id uuid,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='vendor_shift_reports_revises_fk'
  ) THEN
    ALTER TABLE vendor_shift_reports
      ADD CONSTRAINT vendor_shift_reports_revises_fk
      FOREIGN KEY (revises_report_id) REFERENCES vendor_shift_reports(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='vendor_shift_reports_superseded_by_fk'
  ) THEN
    ALTER TABLE vendor_shift_reports
      ADD CONSTRAINT vendor_shift_reports_superseded_by_fk
      FOREIGN KEY (superseded_by) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='vendor_shift_reports_updated_by_fk'
  ) THEN
    ALTER TABLE vendor_shift_reports
      ADD CONSTRAINT vendor_shift_reports_updated_by_fk
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE vendor_shift_reports SET updated_by=created_by WHERE updated_by IS NULL;

ALTER TABLE vendor_shift_reports DROP CONSTRAINT IF EXISTS vendor_shift_report_counts_nonnegative_ck;
ALTER TABLE vendor_shift_reports ADD CONSTRAINT vendor_shift_report_counts_nonnegative_ck CHECK (
  am_total>=0 AND am_operating>=0 AND am_standby>=0 AND am_breakdown>=0 AND am_repair>=0 AND am_other>=0
  AND aa_total>=0 AND aa_operating>=0 AND aa_standby>=0 AND aa_breakdown>=0 AND aa_repair>=0 AND aa_other>=0
);

ALTER TABLE vendor_shift_reports DROP CONSTRAINT IF EXISTS vendor_shift_report_version_positive_ck;
ALTER TABLE vendor_shift_reports ADD CONSTRAINT vendor_shift_report_version_positive_ck CHECK (version > 0);

DROP INDEX IF EXISTS vendor_shift_one_draft_uq;
CREATE UNIQUE INDEX vendor_shift_one_draft_uq
  ON vendor_shift_reports(operation_date, shift_code, vendor_id)
  WHERE status='DRAFT';

DROP INDEX IF EXISTS vendor_shift_one_submitted_uq;
CREATE UNIQUE INDEX vendor_shift_one_submitted_uq
  ON vendor_shift_reports(operation_date, shift_code, vendor_id)
  WHERE status='SUBMITTED';

CREATE INDEX IF NOT EXISTS vendor_shift_history_idx
  ON vendor_shift_reports(vendor_id, operation_date DESC, shift_code, version DESC);

CREATE INDEX IF NOT EXISTS vendor_shift_revises_idx
  ON vendor_shift_reports(revises_report_id);

ALTER TABLE loading_assignments DROP CONSTRAINT IF EXISTS loading_assignment_time_pair_ck;
ALTER TABLE loading_assignments ADD CONSTRAINT loading_assignment_time_pair_ck CHECK (
  (valid_from IS NULL AND valid_to IS NULL) OR (valid_from IS NOT NULL AND valid_to IS NOT NULL)
);

DROP TRIGGER IF EXISTS vendor_shift_reports_touch_updated_at ON vendor_shift_reports;
CREATE TRIGGER vendor_shift_reports_touch_updated_at
  BEFORE UPDATE ON vendor_shift_reports
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS loading_assignments_touch_updated_at ON loading_assignments;
CREATE TRIGGER loading_assignments_touch_updated_at
  BEFORE UPDATE ON loading_assignments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
