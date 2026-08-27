BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Direct, quantity-based consumption of a crusher report column, not a vendor
-- allocation. Corrections/reversals remain in the original signed event ledger.
CREATE TABLE public.mix_item_clay_retase_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_item_id uuid NOT NULL REFERENCES public.mix_items(id) ON DELETE RESTRICT,
  column_id uuid NOT NULL REFERENCES public.clay_report_columns(id) ON DELETE RESTRICT,
  retase_consumed integer NOT NULL CHECK (retase_consumed > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_reason text,
  CONSTRAINT clay_consumption_release_ck CHECK (
    (active AND released_at IS NULL AND released_reason IS NULL)
    OR (NOT active AND released_at IS NOT NULL AND length(trim(coalesce(released_reason,''))) > 0)
  ),
  UNIQUE (mix_item_id, column_id)
);
CREATE INDEX mix_item_clay_source_column_idx ON public.mix_item_clay_retase_sources(column_id);
CREATE INDEX retase_clay_column_balance_idx ON public.retase_events(clay_report_column_id) WHERE clay_report_column_id IS NOT NULL;

CREATE FUNCTION public.clay_retase_balance(target uuid)
RETURNS TABLE(total_retase bigint, consumed_retase bigint)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce((SELECT sum(e.delta) FROM public.retase_events e WHERE e.clay_report_column_id=target),0)::bigint,
    (coalesce((SELECT sum(c.retase_consumed) FROM public.mix_item_clay_retase_sources c WHERE c.column_id=target AND c.active),0)
    + (SELECT count(*) FROM public.qc_retase_allocation_events a JOIN public.retase_events e ON e.id=a.event_id WHERE e.clay_report_column_id=target AND a.active))::bigint;
$$;

CREATE FUNCTION public.guard_clay_mix_consumption() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE context record; balance record;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.mix_item_id,NEW.column_id,NEW.retase_consumed,NEW.created_at) IS DISTINCT FROM
       (OLD.mix_item_id,OLD.column_id,OLD.retase_consumed,OLD.created_at) OR NOT OLD.active OR NEW.active THEN
      RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='clay_consumption_immutable', MESSAGE='Clay consumption is immutable; replace the mix.';
    END IF;
    PERFORM 1 FROM public.clay_report_columns WHERE id=OLD.column_id FOR UPDATE;
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.clay_report_columns WHERE id=NEW.column_id FOR UPDATE;
  SELECT m.material_kind,m.operation_date,m.shift_code,m.status mix_status,s.material_kind sample_kind,s.sample_date,
         r.operation_date report_date,r.shift_code report_shift,r.status report_status,c.status column_status
    INTO context FROM public.mix_items mi JOIN public.mixes m ON m.id=mi.mix_id JOIN public.raw_samples s ON s.id=mi.sample_id
    CROSS JOIN public.clay_report_columns c JOIN public.clay_shift_reports r ON r.id=c.report_id
    WHERE mi.id=NEW.mix_item_id AND c.id=NEW.column_id;
  IF NOT FOUND OR context.material_kind<>'CL' OR context.sample_kind<>'CL' OR context.mix_status<>'ACTIVE'
    OR context.operation_date<>context.report_date OR context.operation_date<>context.sample_date
    OR context.shift_code<>context.report_shift OR context.report_status='SUPERSEDED' OR context.column_status<>'CONFIRMED' OR NOT NEW.active THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='clay_consumption_context', MESSAGE='Clay report column and mix context must match.';
  END IF;
  SELECT * INTO balance FROM public.clay_retase_balance(NEW.column_id);
  IF balance.consumed_retase+NEW.retase_consumed>balance.total_retase THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='clay_consumption_balance', MESSAGE='Clay retase has already been consumed or corrected.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_clay_mix_consumption BEFORE INSERT OR UPDATE ON public.mix_item_clay_retase_sources
FOR EACH ROW EXECUTE FUNCTION public.guard_clay_mix_consumption();

-- Serialize balance changes against mixing, including live reversals and QC
-- negative backfill. The sum includes original + reversal, exactly like reports.
CREATE FUNCTION public.guard_clay_retase_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target uuid; old_column uuid; new_column uuid; change integer; balance record;
BEGIN
  IF TG_OP<>'INSERT' THEN old_column:=OLD.clay_report_column_id; END IF;
  IF TG_OP<>'DELETE' THEN new_column:=NEW.clay_report_column_id; END IF;
  FOR target IN SELECT id FROM public.clay_report_columns WHERE id IN (old_column,new_column) ORDER BY id FOR UPDATE LOOP
    change:=0;
    IF target=old_column THEN change:=change-OLD.delta; END IF;
    IF target=new_column THEN change:=change+NEW.delta; END IF;
    IF change<0 THEN
      SELECT * INTO balance FROM public.clay_retase_balance(target);
      IF balance.consumed_retase>0 AND balance.total_retase+change<balance.consumed_retase THEN
        RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='clay_consumption_balance', MESSAGE='Replace consuming mixes before reducing Clay retase.';
      END IF;
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_clay_retase_balance BEFORE INSERT OR UPDATE OR DELETE ON public.retase_events
FOR EACH ROW EXECUTE FUNCTION public.guard_clay_retase_balance();

CREATE FUNCTION public.guard_consumed_clay_column() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (NEW.report_id,NEW.vendor_id,NEW.source_id,NEW.vendor_name_snapshot,NEW.source_name_snapshot,NEW.header_primary,NEW.header_secondary) IS DISTINCT FROM
     (OLD.report_id,OLD.vendor_id,OLD.source_id,OLD.vendor_name_snapshot,OLD.source_name_snapshot,OLD.header_primary,OLD.header_secondary)
     AND EXISTS(SELECT 1 FROM public.mix_item_clay_retase_sources WHERE column_id=OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='clay_consumption_identity', MESSAGE='Consumed Clay column identity is retained for mixing history.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_consumed_clay_column BEFORE UPDATE ON public.clay_report_columns
FOR EACH ROW EXECUTE FUNCTION public.guard_consumed_clay_column();

ALTER TABLE public.mix_item_clay_retase_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mix_item_clay_retase_sources FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clay_retase_balance(uuid),public.guard_clay_mix_consumption(),public.guard_clay_retase_balance(),public.guard_consumed_clay_column() FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON public.mix_item_clay_retase_sources FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION public.clay_retase_balance(uuid),public.guard_clay_mix_consumption(),public.guard_clay_retase_balance(),public.guard_consumed_clay_column() FROM %I',role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
