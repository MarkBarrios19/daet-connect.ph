-- ================================================================
-- tours_sync_refund_cancellation: authorization gate
--
-- The operator's Process Refund dialog calls this function as its preflight
-- check. On the live project it failed with
--
--   "Refund reservations could not be checked. Ask an administrator to
--    check the database setup."
--
-- Two defects, both invisible from the app:
--
--   1. EXECUTE was never granted to authenticated, so the RPC was refused
--      before it ran. (The dialog turned that refusal into the message above.)
--   2. The function is SECURITY DEFINER but carried no authorization check of
--      its own: its body never consulted get_my_role() or the booking helpers.
--      Granting EXECUTE on it as-is would have let any signed-in user settle
--      the cancellation ledger of any booking by id.
--
-- This migration fixes both without changing what the function does.
--
-- The original body is kept verbatim and renamed to
-- tours_sync_refund_cancellation_inner, which only the owner may call. A new
-- function with the original name and signature (a gatekeeper) checks who is
-- asking and then delegates. The return type is read from the catalogue, so
-- the wrapper matches whatever the body returns (void, numeric, TABLE(...)).
--
-- Idempotent: re-running skips the rename and rebuilds the same wrapper.
--
-- No-op when the function is absent. tours_sync_refund_cancellation is not
-- created by any migration in this repository; it exists only on the project
-- that has been running long enough to accumulate it. A database built from
-- these migrations alone therefore has nothing to wrap, and this file must
-- still apply cleanly there, so a missing function is reported, not raised.
--
-- Requires (when present): get_my_role() (20261024_f0),
-- tours_is_booking_operator(uuid) and tours_is_booking_tourist(uuid)
-- (20261026_f2), tours_cancellations.
-- ================================================================

DO $$
DECLARE
  v_ret  text;
  v_call text;
BEGIN
  -- 1. Read the return type from whichever function is the body right now.
  --    On a fresh project the original is still named tours_sync_refund_cancellation;
  --    on a project that already ran this migration it is the _inner one.
  SELECT pg_get_function_result(p.oid) INTO v_ret
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'tours_sync_refund_cancellation';

  IF v_ret IS NULL THEN
    SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'tours_sync_refund_cancellation_inner';
  END IF;

  IF v_ret IS NULL THEN
    RAISE NOTICE
      'tours_sync_refund_cancellation does not exist in public: nothing to wrap. The Process Refund dialog will still report that refund reservations cannot be checked on this database.';
    RETURN;
  END IF;

  -- 2. Move the original body out of reach, once.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'tours_sync_refund_cancellation_inner'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.tours_sync_refund_cancellation(uuid) RENAME TO tours_sync_refund_cancellation_inner';
  END IF;

  -- 3. Delegate in a way that suits the body's return type.
  IF v_ret = 'void' THEN
    v_call := 'PERFORM public.tours_sync_refund_cancellation_inner(p_booking_id); RETURN;';
  ELSIF v_ret LIKE 'SETOF%' OR v_ret LIKE 'TABLE%' THEN
    v_call := 'RETURN QUERY SELECT * FROM public.tours_sync_refund_cancellation_inner(p_booking_id);';
  ELSE
    v_call := 'RETURN public.tours_sync_refund_cancellation_inner(p_booking_id);';
  END IF;

  -- 4. The gatekeeper: same name, same signature, asks who is calling.
  EXECUTE format($ddl$
    CREATE OR REPLACE FUNCTION public.tours_sync_refund_cancellation(p_booking_id uuid)
    RETURNS %s
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      IF NOT (
        get_my_role() = 'admin'
        OR public.tours_is_booking_operator(p_booking_id)
        OR public.tours_is_booking_tourist(p_booking_id)
      ) THEN
        RAISE EXCEPTION 'Not allowed to sync refunds on this booking.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      %s
    END;
    $fn$;
  $ddl$, v_ret, v_call);

  -- 5. Only the gatekeeper is reachable; the body is owner-only.
  EXECUTE 'REVOKE ALL ON FUNCTION public.tours_sync_refund_cancellation_inner(uuid) FROM PUBLIC, anon, authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.tours_sync_refund_cancellation(uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.tours_sync_refund_cancellation(uuid) TO authenticated';

  RAISE NOTICE 'tours_sync_refund_cancellation wrapped (returns %).', v_ret;
END
$$;
