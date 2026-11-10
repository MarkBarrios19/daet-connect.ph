-- Refund sync authorization suite. One DO block that ALWAYS rolls back (it
-- ends by raising the report), so it is safe on a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/refund_sync_authorization.sql
--   (or paste into the Supabase SQL editor)
--
-- Read the result from the error: "REPORT pass=N fail=M [failures]".
--
-- Covers 20261110_refund_sync_authorization.sql: the gatekeeper in front of
-- tours_sync_refund_cancellation answers to the booking's tourist, its
-- operator and admins, and to nobody else. Needs a published package of an
-- approved operator and two tourist profiles; the bookings are made here.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_operator_profile uuid;
  v_tourist uuid;
  v_other_tourist uuid;
  v_pkg uuid;
  v_variant uuid;
  v_min int;
  v_date date := current_date + 30;
  v_booking uuid;
  v_other_booking uuid;
  v_inner_ret text;
BEGIN
  -- Setup: a published package with a price option, its approved operator,
  -- and two tourist profiles.
  SELECT p.id, v.id, greatest(v.min_pax, 1), o.profile_id
    INTO v_pkg, v_variant, v_min, v_operator_profile
  FROM tours_packages p
  JOIN tours_package_price_variants v ON v.package_id = p.id
  JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
  WHERE p.status = 'published'
  ORDER BY v.is_default DESC
  LIMIT 1;

  SELECT id INTO v_tourist FROM profiles WHERE role = 'tourist' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other_tourist FROM profiles
   WHERE role = 'tourist' AND id <> v_tourist AND id <> v_operator_profile
   ORDER BY created_at LIMIT 1;

  IF v_pkg IS NULL OR v_tourist IS NULL OR v_other_tourist IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: package=% variant=% operator=% tourist=% other=%',
      v_pkg, v_variant, v_operator_profile, v_tourist, v_other_tourist;
  END IF;

  -- The suite is about a function this repository does not create. Say so
  -- plainly instead of failing nine checks on a database that never had it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname = 'tours_sync_refund_cancellation'
  ) THEN
    RAISE EXCEPTION 'REPORT skipped: tours_sync_refund_cancellation is not installed on this database.';
  END IF;

  -- 1. The gatekeeper is callable by a signed-in user. This is the privilege
  --    whose absence made the Process Refund dialog say the reservations
  --    "could not be checked".
  IF has_function_privilege('authenticated',
       'public.tours_sync_refund_cancellation(uuid)', 'execute') THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'authenticated cannot execute the gatekeeper; ';
  END IF;

  -- 2. Visitors cannot call it at all.
  IF NOT has_function_privilege('anon',
       'public.tours_sync_refund_cancellation(uuid)', 'execute') THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'anon can execute the gatekeeper; ';
  END IF;

  -- 3. The wrapped body is not reachable by a signed-in user; it would
  --    otherwise be a way around the check.
  IF NOT has_function_privilege('authenticated',
       'public.tours_sync_refund_cancellation_inner(uuid)', 'execute') THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'authenticated can execute the inner body; ';
  END IF;

  -- 4. The original body still exists; the wrapper did not replace it.
  SELECT pg_get_function_result(p.oid) INTO v_inner_ret
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname = 'tours_sync_refund_cancellation_inner';
  IF v_inner_ret IS NOT NULL THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'the inner body is missing; ';
  END IF;

  -- 5. The gatekeeper is SECURITY DEFINER with a pinned search_path.
  SELECT count(*) INTO n
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname = 'tours_sync_refund_cancellation'
    AND p.prosecdef
    AND p.proconfig IS NOT NULL
    AND 'search_path=public' = ANY (p.proconfig);
  IF n > 0 THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'the gatekeeper is not hardened; ';
  END IF;

  -- Two cancelled bookings on an open date: one for each tourist.
  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
  VALUES (v_pkg, v_date, 50, 0)
  ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = 50;

  INSERT INTO tours_bookings (
    package_id, user_id, price_variant_id, tour_date, number_of_pax,
    contact_name, contact_email, contact_phone, booking_reference, status
  ) VALUES (
    v_pkg, v_tourist, v_variant, v_date, v_min,
    'Refund Test', 'refund-test@example.invalid', '0917',
    'BK-REFUNDTS-' || substr(gen_random_uuid()::text, 1, 8), 'cancelled'
  ) RETURNING id INTO v_booking;

  INSERT INTO tours_bookings (
    package_id, user_id, price_variant_id, tour_date, number_of_pax,
    contact_name, contact_email, contact_phone, booking_reference, status
  ) VALUES (
    v_pkg, v_other_tourist, v_variant, v_date, v_min,
    'Other Tourist', 'refund-other@example.invalid', '0918',
    'BK-REFUNDTS-' || substr(gen_random_uuid()::text, 1, 8), 'cancelled'
  ) RETURNING id INTO v_other_booking;

  -- 6. A signed-in tourist who is not on the booking is refused.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.tours_sync_refund_cancellation(v_booking);
    ok := false;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := true;
  WHEN others THEN
    ok := false;
  END;
  RESET ROLE;
  IF ok THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'an unrelated tourist synced a booking; ';
  END IF;

  -- 7. The booking's own tourist is allowed through.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.tours_sync_refund_cancellation(v_booking);
    ok := true;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := false;
  WHEN others THEN
    -- A data complaint from the body is not an authorization refusal.
    ok := true;
  END;
  RESET ROLE;
  IF ok THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'the booking tourist was refused; ';
  END IF;

  -- 8. The booking's operator is allowed through.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.tours_sync_refund_cancellation(v_booking);
    ok := true;
  EXCEPTION WHEN insufficient_privilege THEN
    ok := false;
  WHEN others THEN
    ok := true;
  END;
  RESET ROLE;
  IF ok THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'the booking operator was refused; ';
  END IF;

  -- 9. A visitor is refused before the body runs.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.tours_sync_refund_cancellation(v_booking);
    ok := false;
  EXCEPTION WHEN others THEN
    ok := true;
  END;
  RESET ROLE;
  IF ok THEN
    pass := pass + 1;
  ELSE
    fails := fails || 'anon synced a booking; ';
  END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass,
    (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
