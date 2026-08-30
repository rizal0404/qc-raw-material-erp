BEGIN;

ALTER TYPE mapping_status ADD VALUE IF NOT EXISTS 'RESERVED' AFTER 'SUGGESTED';

DROP INDEX IF EXISTS qc_alloc_open_assignment_sample_uq;
CREATE UNIQUE INDEX qc_alloc_open_assignment_sample_uq
  ON qc_retase_allocations(assignment_id, sample_id)
  WHERE sample_id IS NOT NULL AND mapping_status IN ('SUGGESTED','RESERVED','AMBIGUOUS','CONFIRMED','REVIEW_REQUIRED');

COMMIT;
