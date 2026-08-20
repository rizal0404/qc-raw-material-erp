BEGIN;

-- PostgreSQL does not add indexes on referencing columns automatically.
-- Cover every foreign key that is not already the leading part of an index.
CREATE INDEX IF NOT EXISTS crushers_plant_id_idx
  ON public.crushers (plant_id);

CREATE INDEX IF NOT EXISTS loading_assignments_am_id_idx
  ON public.loading_assignments (am_id);
CREATE INDEX IF NOT EXISTS loading_assignments_created_by_idx
  ON public.loading_assignments (created_by);
CREATE INDEX IF NOT EXISTS loading_assignments_crusher_id_idx
  ON public.loading_assignments (crusher_id);
CREATE INDEX IF NOT EXISTS loading_assignments_pile_id_idx
  ON public.loading_assignments (pile_id);
CREATE INDEX IF NOT EXISTS loading_assignments_shift_code_idx
  ON public.loading_assignments (shift_code);
CREATE INDEX IF NOT EXISTS loading_assignments_source_id_idx
  ON public.loading_assignments (source_id);
CREATE INDEX IF NOT EXISTS loading_assignments_updated_by_idx
  ON public.loading_assignments (updated_by);
CREATE INDEX IF NOT EXISTS loading_assignments_vendor_id_idx
  ON public.loading_assignments (vendor_id);

CREATE INDEX IF NOT EXISTS mix_item_chemistry_revisions_changed_by_idx
  ON public.mix_item_chemistry_revisions (changed_by);

CREATE INDEX IF NOT EXISTS mixes_created_by_idx
  ON public.mixes (created_by);
CREATE INDEX IF NOT EXISTS mixes_plant_id_idx
  ON public.mixes (plant_id);
CREATE INDEX IF NOT EXISTS mixes_replaces_mix_id_idx
  ON public.mixes (replaces_mix_id);
CREATE INDEX IF NOT EXISTS mixes_shift_code_idx
  ON public.mixes (shift_code);
CREATE INDEX IF NOT EXISTS mixes_updated_by_idx
  ON public.mixes (updated_by);

CREATE INDEX IF NOT EXISTS qc_retase_allocations_confirmed_by_idx
  ON public.qc_retase_allocations (confirmed_by);
CREATE INDEX IF NOT EXISTS qc_retase_allocations_created_by_idx
  ON public.qc_retase_allocations (created_by);
CREATE INDEX IF NOT EXISTS qc_retase_allocations_crusher_id_idx
  ON public.qc_retase_allocations (crusher_id);
CREATE INDEX IF NOT EXISTS qc_retase_allocations_shift_code_idx
  ON public.qc_retase_allocations (shift_code);
CREATE INDEX IF NOT EXISTS qc_retase_allocations_updated_by_idx
  ON public.qc_retase_allocations (updated_by);
CREATE INDEX IF NOT EXISTS qc_retase_allocations_vendor_id_idx
  ON public.qc_retase_allocations (vendor_id);

CREATE INDEX IF NOT EXISTS quality_targets_plant_id_idx
  ON public.quality_targets (plant_id);
CREATE INDEX IF NOT EXISTS raw_samples_plant_id_idx
  ON public.raw_samples (plant_id);

CREATE INDEX IF NOT EXISTS retase_events_am_id_idx
  ON public.retase_events (am_id);
CREATE INDEX IF NOT EXISTS retase_events_assignment_aa_id_idx
  ON public.retase_events (assignment_aa_id);
CREATE INDEX IF NOT EXISTS retase_events_crusher_id_idx
  ON public.retase_events (crusher_id);
CREATE INDEX IF NOT EXISTS retase_events_pile_id_idx
  ON public.retase_events (pile_id);
CREATE INDEX IF NOT EXISTS retase_events_resolved_by_idx
  ON public.retase_events (resolved_by);
CREATE INDEX IF NOT EXISTS retase_events_shift_code_idx
  ON public.retase_events (shift_code);
CREATE INDEX IF NOT EXISTS retase_events_source_id_idx
  ON public.retase_events (source_id);
CREATE INDEX IF NOT EXISTS retase_events_vendor_id_idx
  ON public.retase_events (vendor_id);

CREATE INDEX IF NOT EXISTS user_crusher_scopes_crusher_id_idx
  ON public.user_crusher_scopes (crusher_id);

CREATE INDEX IF NOT EXISTS vendor_shift_reports_created_by_idx
  ON public.vendor_shift_reports (created_by);
CREATE INDEX IF NOT EXISTS vendor_shift_reports_shift_code_idx
  ON public.vendor_shift_reports (shift_code);
CREATE INDEX IF NOT EXISTS vendor_shift_reports_submitted_by_idx
  ON public.vendor_shift_reports (submitted_by);
CREATE INDEX IF NOT EXISTS vendor_shift_reports_superseded_by_idx
  ON public.vendor_shift_reports (superseded_by);
CREATE INDEX IF NOT EXISTS vendor_shift_reports_updated_by_idx
  ON public.vendor_shift_reports (updated_by);

COMMIT;
