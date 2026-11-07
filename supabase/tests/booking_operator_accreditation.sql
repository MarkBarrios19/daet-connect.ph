-- Run only against a disposable/local Supabase database after applying migrations:
-- psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_operator_accreditation.sql
-- Requires a published package + price variant of an approved operator, a
-- distinct tourist, an approved guide and an admin. All fixtures are rolled back.
BEGIN;
DO $test$
DECLARE
  pkg uuid; variant uuid; pax int; operator_id uuid; operator_profile uuid;
  tourist uuid; v_guide_id uuid; guide_profile uuid; admin_id uuid;
  booking uuid; proof uuid; swap_id uuid; payment_id uuid; d date := (now() AT TIME ZONE 'Asia/Manila')::date + 90;
  n int; state text; denied boolean;
BEGIN
  SELECT p.id, v.id, greatest(v.min_pax, 1), o.id, o.profile_id
    INTO pkg, variant, pax, operator_id, operator_profile
    FROM tours_packages p JOIN tours_package_price_variants v ON v.package_id = p.id
    JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
    WHERE p.status = 'published' ORDER BY v.is_default DESC LIMIT 1;
  SELECT p.id INTO tourist FROM profiles p WHERE p.role = 'tourist' AND p.id <> operator_profile
    AND (SELECT count(*) FROM tours_bookings b WHERE b.user_id = p.id AND b.status = 'pending') < 10 LIMIT 1;
  SELECT id, profile_id INTO v_guide_id, guide_profile FROM tours_guides
    WHERE accreditation_status = 'approved' AND profile_id NOT IN (operator_profile, tourist)
      AND NOT EXISTS (SELECT 1 FROM tours_bookings b WHERE b.assigned_guide_id = tours_guides.id AND b.tour_date = d AND b.status IN ('pending', 'confirmed')) LIMIT 1;
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' AND id NOT IN (operator_profile, tourist, guide_profile) LIMIT 1;
  IF pkg IS NULL OR tourist IS NULL OR v_guide_id IS NULL OR admin_id IS NULL THEN
    RAISE EXCEPTION 'Missing required local fixtures: package %, tourist %, guide %, admin %', pkg, tourist, v_guide_id, admin_id;
  END IF;
  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
    VALUES (pkg, d, greatest(50, pax), 0)
    ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = greatest(50, pax);
  UPDATE tours_bookings SET created_at = now() - interval '1 day' WHERE user_id = tourist AND created_at > now() - interval '10 minutes';
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (pkg, tourist, variant, d, pax, 'RLS test', 'test@example.invalid', '0917', 'BK-ACC-' || substr(gen_random_uuid()::text, 1, 8)) RETURNING id INTO booking;
  INSERT INTO tours_guide_availability (guide_id, available_date, is_available) VALUES (v_guide_id, d, true)
    ON CONFLICT (guide_id, available_date) DO UPDATE SET is_available = true;
  UPDATE tours_bookings SET assigned_guide_id = v_guide_id WHERE id = booking;
  INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, recorded_by)
    VALUES (booking, 1, 'cash', 'pending', operator_profile);
  INSERT INTO tours_payment_proofs (booking_id, amount, payment_method, proof_image_url, reference_number, submitted_by)
    VALUES (booking, 1, 'gcash', booking || '/proof.png', 'test', tourist) RETURNING id INTO proof;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('tours-payment-proofs', booking || '/proof.png');
  INSERT INTO tours_live_sessions (booking_id, guide_id) VALUES (booking, v_guide_id);
  INSERT INTO tours_live_positions (booking_id, profile_id, role, lat, lng, precision) VALUES (booking, guide_profile, 'guide', 14, 122, 'exact');
  INSERT INTO tours_guide_swap_requests (booking_id, from_guide_id, reason) VALUES (booking, v_guide_id, 'test reason') RETURNING id INTO swap_id;

  -- Check each status against the same owning row, not a different operator.
  FOREACH state IN ARRAY ARRAY['approved', 'pending', 'rejected', 'approved'] LOOP
    RESET ROLE;
    IF state = 'approved' THEN UPDATE tours_operators SET accreditation_status = 'approved' WHERE id = operator_id;
    ELSIF state = 'pending' THEN UPDATE tours_operators SET accreditation_status = 'pending' WHERE id = operator_id;
    ELSE UPDATE tours_operators SET accreditation_status = 'rejected' WHERE id = operator_id; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', operator_profile, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF state = 'approved' THEN
      IF NOT tours_is_booking_operator(booking) OR NOT tours_live_can_watch(booking) OR NOT tours_realtime_live_allowed('tour-live:' || booking) THEN RAISE EXCEPTION 'approved owner denied'; END IF;
      SELECT count(*) INTO n FROM tours_bookings WHERE id = booking; IF n <> 1 THEN RAISE EXCEPTION 'approved booking read denied'; END IF;
      SELECT count(*) INTO n FROM tours_payments WHERE booking_id = booking; IF n <> 1 THEN RAISE EXCEPTION 'approved payment read denied'; END IF;
      SELECT count(*) INTO n FROM tours_payment_proofs WHERE id = proof; IF n <> 1 THEN RAISE EXCEPTION 'approved proof read denied'; END IF;
      SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'tours-payment-proofs' AND name = booking || '/proof.png'; IF n <> 1 THEN RAISE EXCEPTION 'approved proof object denied'; END IF;
      SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = booking; IF n <> 1 THEN RAISE EXCEPTION 'approved position denied'; END IF;
      SELECT count(*) INTO n FROM tours_live_sessions WHERE booking_id = booking; IF n <> 1 THEN RAISE EXCEPTION 'approved session denied'; END IF;
      UPDATE tours_bookings SET assigned_guide_id = v_guide_id WHERE id = booking; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'approved assignment denied'; END IF;
      UPDATE tours_payment_proofs SET rejection_reason = NULL WHERE id = proof; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'approved proof update denied'; END IF;
      PERFORM tours_refundable_amount(booking);
      INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, recorded_by)
        VALUES (booking, 1, 'cash', 'pending', operator_profile) RETURNING id INTO payment_id;
      DELETE FROM tours_payments WHERE id = payment_id; GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN RAISE EXCEPTION 'approved manual payment write denied'; END IF;
    ELSE
      IF tours_is_booking_operator(booking) OR tours_live_can_watch(booking) OR tours_realtime_live_allowed('tour-live:' || booking) THEN RAISE EXCEPTION '% owner allowed', state; END IF;
      SELECT count(*) INTO n FROM tours_bookings WHERE id = booking; IF n <> 0 THEN RAISE EXCEPTION '% booking visible', state; END IF;
      SELECT count(*) INTO n FROM tours_payments WHERE booking_id = booking; IF n <> 0 THEN RAISE EXCEPTION '% payments visible', state; END IF;
      SELECT count(*) INTO n FROM tours_payment_proofs WHERE id = proof; IF n <> 0 THEN RAISE EXCEPTION '% proof visible', state; END IF;
      SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'tours-payment-proofs' AND name = booking || '/proof.png'; IF n <> 0 THEN RAISE EXCEPTION '% proof object visible', state; END IF;
      SELECT count(*) INTO n FROM tours_live_sessions WHERE booking_id = booking; IF n <> 0 THEN RAISE EXCEPTION '% session visible', state; END IF;
      SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = booking; IF n <> 0 THEN RAISE EXCEPTION '% position visible', state; END IF;
      SELECT count(*) INTO n FROM tours_guide_swap_requests WHERE id = swap_id; IF n <> 0 THEN RAISE EXCEPTION '% swap visible', state; END IF;
      UPDATE tours_bookings SET assigned_guide_id = NULL WHERE id = booking; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '% assigned guide', state; END IF;
      UPDATE tours_bookings SET status = 'confirmed' WHERE id = booking; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '% updated booking', state; END IF;
      UPDATE tours_payments SET notes = 'test' WHERE booking_id = booking; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '% updated payment', state; END IF;
      DELETE FROM tours_payments WHERE booking_id = booking; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '% deleted payment', state; END IF;
      UPDATE tours_payment_proofs SET rejection_reason = 'test' WHERE id = proof; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION '% updated proof', state; END IF;
      denied := false; BEGIN INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, recorded_by) VALUES (booking, 1, 'cash', 'pending', operator_profile); EXCEPTION WHEN insufficient_privilege THEN denied := true; END; IF NOT denied THEN RAISE EXCEPTION '% inserted payment', state; END IF;
      denied := false; BEGIN PERFORM tours_live_end(booking); EXCEPTION WHEN insufficient_privilege THEN denied := true; END; IF NOT denied THEN RAISE EXCEPTION '% ended live session', state; END IF;
      denied := false; BEGIN PERFORM tours_record_refund(booking, 1, 'cash', 'test'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END; IF NOT denied THEN RAISE EXCEPTION '% recorded refund', state; END IF;
      denied := false; BEGIN PERFORM tours_decide_guide_swap(swap_id, false); EXCEPTION WHEN insufficient_privilege THEN denied := true; END; IF NOT denied THEN RAISE EXCEPTION '% decided swap', state; END IF;
      denied := false; BEGIN PERFORM tours_refundable_amount(booking); EXCEPTION WHEN insufficient_privilege THEN denied := true; END; IF NOT denied THEN RAISE EXCEPTION '% read refund balance', state; END IF;
    END IF;
  END LOOP;
  -- Test independent roles even while the owning operator is no longer approved.
  RESET ROLE;
  UPDATE tours_operators SET accreditation_status = 'pending' WHERE id = operator_id;
  SET LOCAL ROLE authenticated;
  -- Tourist, guide and admin retain their independent access.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', tourist, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM tours_bookings WHERE id = booking; IF n <> 1 THEN RAISE EXCEPTION 'tourist booking denied'; END IF;
  SELECT count(*) INTO n FROM tours_payment_proofs WHERE id = proof; IF n <> 1 THEN RAISE EXCEPTION 'tourist proof denied'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', guide_profile, 'role', 'authenticated')::text, true);
  IF NOT tours_live_can_watch(booking) THEN RAISE EXCEPTION 'guide live denied'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM tours_bookings WHERE id = booking; IF n <> 1 THEN RAISE EXCEPTION 'admin booking denied'; END IF;
  SELECT count(*) INTO n FROM tours_payment_proofs WHERE id = proof; IF n <> 1 THEN RAISE EXCEPTION 'admin proof denied'; END IF;
  SELECT count(*) INTO n FROM tours_payments WHERE booking_id = booking; IF n <> 1 THEN RAISE EXCEPTION 'admin payments denied'; END IF;
  PERFORM tours_refundable_amount(booking);
  PERFORM tours_decide_guide_swap(swap_id, false);
  SELECT count(*) INTO n FROM tours_live_positions WHERE booking_id = booking; IF n <> 1 THEN RAISE EXCEPTION 'admin live denied'; END IF;
  RAISE NOTICE 'booking operator accreditation policy tests passed';
END;
$test$;
ROLLBACK;
