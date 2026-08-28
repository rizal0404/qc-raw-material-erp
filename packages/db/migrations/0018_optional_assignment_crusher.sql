BEGIN;

-- A shift-report assignment can serve any crusher of its own material kind.
-- The actual destination remains mandatory on every retase event.
ALTER TABLE loading_assignments ALTER COLUMN crusher_id DROP NOT NULL;
ALTER TABLE qc_retase_allocations ALTER COLUMN crusher_id DROP NOT NULL;
ALTER TABLE loading_assignments ADD CONSTRAINT loading_assignment_destination_ck CHECK (
  crusher_id IS NOT NULL OR (assignment_origin = 'SHIFT_REPORT' AND pile_id IS NULL)
);

COMMIT;
