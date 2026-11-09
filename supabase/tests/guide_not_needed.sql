-- "We don't need a tour guide" suite (migration 20261201_guide_not_needed.sql).
-- One DO block that ALWAYS rolls back (it ends by raising the report), so it is
-- safe on a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/guide_not_needed.sql
--   (or paste into the Supabase SQL editor)
--
-- Read the result from the error: "REPORT pass=N fail=M [failures]".
-- Needs a published package of an approved operator, a tourist and an approved
-- guide.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_pkg uuid;
  v_variant uuid;
  v_min int;
  v_tourist uuid;
  v_guide uuid;
  v_booking uuid;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date + 23;
BEGIN
  SELECT p.id, v.id, greatest(v.min_pax, 1) INTO v_pkg, v_variant, v_min
  FROM tours_packages p
  JOIN tours_package_price_variants v ON v.package_id = p.id
  JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
  WHERE p.status = 'published' ORDER BY v.is_default DESC LIMIT 1;
  SELECT id INTO v_tourist FROM profiles WHERE role = 'tourist' LIMIT 1;
  SELECT id INTO v_guide FROM tours_guides WHERE accreditation_status = 'approved' LIMIT 1;
  IF v_pkg IS NULL OR v_tourist IS NULL OR v_guide IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: package=% tourist=% guide=%', v_pkg, v_tourist, v_guide;
  END IF;

  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
  VALUES (v_pkg, v_date, 50, 0)
  ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = 50;
  INSERT INTO tours_guide_availability (guide_id, available_date, is_available)
  VALUES (v_guide, v_date, true)
  ON CONFLICT (guide_id, available_date) DO UPDATE SET is_available = true;
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference, status)
  VALUES (v_pkg, v_tourist, v_variant, v_date, v_min, 'Guide Test', 'guide-test@example.invalid', '0917', 'BK-GUIDETEST-1', 'confirmed')
  RETURNING id INTO v_booking;

  -- Setup: the guide leads the tour, and has asked for a swap.
  UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_booking;
  INSERT INTO tours_guide_swap_requests (booking_id, from_guide_id, to_guide_id, reason)
  VALUES (v_booking, v_guide, NULL, 'Boat schedule clash');
  SELECT count(*) INTO n FROM tours_bookings WHERE id = v_booking AND assigned_guide_id = v_guide;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'setup: guide not assigned; '; END IF;

  -- 1. Recording the guest's request takes the guide off the booking.
  UPDATE tours_bookings
     SET guide_not_needed_at = now(), guide_not_needed_note = 'Guest asked in chat'
   WHERE id = v_booking;
  SELECT count(*) INTO n FROM tours_bookings WHERE id = v_booking AND assigned_guide_id IS NULL;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'guide stayed on a waived tour; '; END IF;

  -- 2. ...and the guide's pending swap request is cancelled with it.
  SELECT count(*) INTO n FROM tours_guide_swap_requests
   WHERE booking_id = v_booking AND status = 'cancelled';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'swap left pending without a guide; '; END IF;

  -- 3. Naming a guide answers the request.
  UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_booking;
  SELECT count(*) INTO n FROM tours_bookings
   WHERE id = v_booking AND assigned_guide_id = v_guide AND guide_not_needed_at IS NULL AND guide_not_needed_note IS NULL;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'flag outlived the new guide; '; END IF;

  -- 4. A note longer than the limit is refused.
  BEGIN
    UPDATE tours_bookings SET guide_not_needed_note = repeat('a', 301) WHERE id = v_booking;
    ok := false;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'over-long note accepted; '; END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
