BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Direct Clay columns identify the material, not an individual hauling unit.
-- Keep the original traceability requirement for every non-Clay event.
ALTER TABLE public.retase_events DROP CONSTRAINT retase_aa_snapshot_ck;
ALTER TABLE public.retase_events ADD CONSTRAINT retase_aa_snapshot_ck CHECK (
  event_type = 'REVERSAL'
  OR aa_id IS NOT NULL
  OR length(trim(coalesce(aa_unit_no_snapshot, ''))) > 0
  OR (
    material_kind IS NOT NULL AND material_kind = 'CL'
    AND clay_report_id IS NOT NULL AND clay_report_column_id IS NOT NULL
  )
) NOT VALID;
-- Preserve the NOT VALID compatibility policy of migration 0005 for legacy rows.
-- New inserts and updates are still checked by PostgreSQL.

ALTER TABLE public.retase_events DROP CONSTRAINT retase_reversal_shape_ck;
ALTER TABLE public.retase_events ADD CONSTRAINT retase_reversal_shape_ck CHECK (
  (event_type = 'REVERSAL' AND delta = -1 AND reverses_event_id IS NOT NULL AND reason IS NOT NULL)
  OR (event_type <> 'REVERSAL' AND delta = 1)
  OR (
    event_type = 'MANUAL_CORRECTION' AND delta = -1
    AND entry_source = 'QC_BACKFILL' AND entry_batch_id IS NOT NULL
    AND material_kind IS NOT NULL AND material_kind = 'CL'
    AND clay_report_id IS NOT NULL AND clay_report_column_id IS NOT NULL
    AND reverses_event_id IS NULL AND length(trim(coalesce(reason, ''))) > 0
  )
);

COMMIT;
