BEGIN;

-- The application uses Fastify plus a trusted PostgreSQL connection for every
-- business operation. Supabase Data API roles must not access these tables.
ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crushers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_crusher_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_shift_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_assignment_aas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_retase_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_item_chemistry_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ton_per_retase_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_retase_allocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_item_retase_allocations ENABLE ROW LEVEL SECURITY;

-- Views created by a privileged owner bypass underlying RLS unless they use
-- the caller's privileges (supported by both local and Supabase PostgreSQL 17).
ALTER VIEW public.v_mix_summary SET (security_invoker = true);

-- Supabase roles do not exist in plain PostgreSQL, so keep this migration
-- portable by revoking their access only when the roles are present.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

-- PostgreSQL grants function execution to PUBLIC by default. No application
-- function is a browser-facing RPC, and Data API roles inherit schema usage
-- through PUBLIC, so remove those inherited privileges too.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
