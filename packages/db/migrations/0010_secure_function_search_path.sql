BEGIN;

-- Resolve built-in functions from the trusted catalog only. The trigger body
-- does not need application-schema object lookup.
ALTER FUNCTION public.touch_updated_at()
  SET search_path = pg_catalog;

COMMIT;
