-- F12 integration suite: RLS per role, booking capacity and rate limits,
-- messaging channels, webhook replay. Runs as one DO block and ALWAYS rolls back (it ends by
-- raising the report), so it is safe on a live project:
--
--   psql "$DATABASE_URL" -f supabase/tests/integration.sql
--   (or paste into the Supabase SQL editor)
--
-- Read the result from the error message: "REPORT pass=N fail=M [failures]".
-- Needs at least one published package with a price variant, one tourist
-- with a booking, the package's operator, one approved guide and one admin.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  n2 int;
  v_tourist uuid;
  v_other uuid;
  v_operator_profile uuid;
  v_operator uuid;
  v_guide_profile uuid;
  v_guide uuid;
  v_admin uuid;
  v_pkg uuid;
  v_variant uuid;
  v_min int;
  v_booking uuid;
  v_date date := (now() AT TIME ZONE 'Asia/Manila')::date + 30;
  v_id uuid;
  v_gt uuid;
  v_og uuid;
  v_oa uuid;
BEGIN
  -- ------------------------------------------------------------ fixtures
  SELECT p.id, v.id, v.min_pax, o.profile_id, o.id
    INTO v_pkg, v_variant, v_min, v_operator_profile, v_operator
  FROM tours_packages p
  JOIN tours_package_price_variants v ON v.package_id = p.id
  JOIN tours_operators o ON o.id = p.operator_id AND o.accreditation_status = 'approved'
  WHERE p.status = 'published'
  ORDER BY v.is_default DESC
  LIMIT 1;
  SELECT user_id INTO v_tourist FROM tours_bookings b JOIN profiles pr ON pr.id = b.user_id AND pr.role = 'tourist' LIMIT 1;
  SELECT id INTO v_other FROM profiles WHERE role = 'tourist' AND id <> v_tourist LIMIT 1;
  SELECT profile_id, id INTO v_guide_profile, v_guide FROM tours_guides WHERE accreditation_status = 'approved' LIMIT 1;
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_pkg IS NULL OR v_tourist IS NULL OR v_guide IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: package=% tourist=% guide=% admin=%', v_pkg, v_tourist, v_guide, v_admin;
  END IF;

  -- A clean, wide-open date for the capacity and rate-limit checks.
  INSERT INTO tours_package_availability (package_id, available_date, capacity_total, capacity_booked)
  VALUES (v_pkg, v_date, greatest(v_min, 1) * 3, 0)
  ON CONFLICT (package_id, available_date) DO UPDATE SET capacity_total = greatest(v_min, 1) * 3, capacity_booked = 0;
  -- Clear the tourist's rate-limit history inside this rolled-back transaction.
  UPDATE tours_bookings SET created_at = now() - interval '1 day' WHERE user_id = v_tourist AND created_at > now() - interval '10 minutes';
  UPDATE tours_bookings SET status = 'confirmed' WHERE user_id = v_tourist AND status = 'pending';

  -- ------------------------------------------------------------ anon
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM tours_packages; ok := n > 0;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon reads published packages; '; END IF;
  SELECT count(*) INTO n FROM tours_packages WHERE status <> 'published'; ok := n = 0;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon sees unpublished packages; '; END IF;
  BEGIN SELECT count(*) INTO n FROM tours_bookings; ok := n = 0; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon reads bookings; '; END IF;
  BEGIN SELECT count(*) INTO n FROM profiles; ok := n = 0; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon reads profiles; '; END IF;
  BEGIN SELECT count(*) INTO n FROM rewards_ledger; ok := n = 0; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon reads rewards; '; END IF;
  BEGIN SELECT count(*) INTO n FROM tours_guide_availability; ok := n = 0; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon reads guide availability; '; END IF;
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_tourist, v_variant, v_date, v_min, 'x', 'x@example.ph', '0', 'BK-TEST-ANON');
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon creates booking; '; END IF;
  BEGIN PERFORM tours_admin_analytics(current_date - 7, current_date); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'anon runs analytics; '; END IF;
  RESET ROLE;

  -- ------------------------------------------------------------ tourist
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_bookings WHERE user_id <> v_tourist;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist sees others'' bookings; '; END IF;
  SELECT count(*) INTO n FROM tours_notifications WHERE profile_id <> v_tourist;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist sees others'' notifications; '; END IF;
  SELECT count(*) INTO n FROM rewards_ledger WHERE profile_id <> v_tourist;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist sees others'' points; '; END IF;
  BEGIN UPDATE profiles SET role = 'admin' WHERE id = v_tourist; ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist promotes self to admin; '; END IF;
  UPDATE tours_bookings SET status = 'completed' WHERE user_id = v_tourist; GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'tourist changes booking status; '; END IF;
  BEGIN
    INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider)
    SELECT id, 1, 'cash', 'completed', 'manual' FROM tours_bookings WHERE user_id = v_tourist LIMIT 1;
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist records own payment; '; END IF;
  BEGIN INSERT INTO rewards_ledger (profile_id, points, source, ref_id) VALUES (v_tourist, 999, 'tours.hack', 'x'); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist awards own points; '; END IF;
  BEGIN PERFORM tours_admin_analytics(current_date - 7, current_date); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist runs analytics; '; END IF;

  -- Capacity: the date has 3 × min_pax seats; booking more must fail.
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_tourist, v_variant, v_date, greatest(v_min, 1) * 3 + 1, 'Test', 't@example.ph', '0917', 'BK-TEST-CAP');
    ok := false;
  EXCEPTION WHEN others THEN ok := SQLERRM ILIKE '%seat%' OR SQLERRM ILIKE '%fully booked%' OR SQLERRM ILIKE '%participants%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'overbooking a date is allowed; '; END IF;
  -- Booking the exact remaining seats works, and then the date is full.
  INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
  VALUES (v_pkg, v_tourist, v_variant, v_date, greatest(v_min, 1) * 3, 'Test', 't@example.ph', '0917', 'BK-TEST-FILL') RETURNING id INTO v_booking;
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_tourist, v_variant, v_date, greatest(v_min, 1), 'Test', 't@example.ph', '0917', 'BK-TEST-FULL');
    ok := false;
  EXCEPTION WHEN others THEN ok := SQLERRM ILIKE '%fully booked%' OR SQLERRM ILIKE '%seat%'; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'full date still bookable; '; END IF;
  RESET ROLE;

  -- Rate limit: 5 bookings in 10 minutes, the 6th is refused.
  UPDATE tours_package_availability SET capacity_total = 1000 WHERE package_id = v_pkg AND available_date = v_date;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  n := 1; -- the fill booking above already counts
  ok := true;
  FOR i IN 1..5 LOOP
    BEGIN
      INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
      VALUES (v_pkg, v_tourist, v_variant, v_date, greatest(v_min, 1), 'Test', 't@example.ph', '0917', 'BK-TEST-RL' || i);
      n := n + 1;
    EXCEPTION WHEN others THEN
      ok := SQLERRM ILIKE '%several bookings%';
      EXIT;
    END;
  END LOOP;
  IF ok AND n = 5 THEN pass := pass + 1; ELSE fails := fails || format('rate limit allowed %s bookings; ', n); END IF;
  RESET ROLE;

  -- ------------------------------------------------------------ operator
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_bookings b WHERE NOT EXISTS (SELECT 1 FROM tours_packages p WHERE p.id = b.package_id AND p.operator_id = v_operator)
    AND b.user_id <> v_operator_profile;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'operator sees other operators'' bookings; '; END IF;
  SELECT count(*) INTO n FROM tours_payments pay WHERE NOT tours_is_booking_operator(pay.booking_id) AND NOT tours_is_booking_tourist(pay.booking_id);
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'operator sees other operators'' payments; '; END IF;
  UPDATE tours_bookings SET status = 'confirmed' WHERE id = v_booking; GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'operator cannot confirm own booking; '; END IF;
  BEGIN PERFORM tours_admin_analytics(current_date - 7, current_date); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'operator runs analytics; '; END IF;
  -- Only tourists create bookings (F13); not even for the operator's own account.
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_operator_profile, v_variant, v_date, greatest(v_min, 1), 'x', 'x@example.ph', '0', 'BK-TEST-OPERATOR');
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'operator creates booking; '; END IF;
  BEGIN
    INSERT INTO tours_merchandise (name, category, seller_name, submitted_by_operator_id, review_status, created_by)
    VALUES ('Test', 'tshirt', 'Test', v_operator, 'approved', v_operator_profile);
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'operator self-approves merchandise; '; END IF;
  RESET ROLE;

  -- ------------------------------------------------------------ guide
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_bookings WHERE assigned_guide_id IS DISTINCT FROM v_guide AND user_id <> v_guide_profile;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'guide sees unassigned bookings; '; END IF;
  BEGIN
    INSERT INTO tours_checkins (booking_id, guide_id, checked_in_by, method) VALUES (v_booking, v_guide, v_guide_profile, 'manual');
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'guide inserts check-in directly (bypassing tours_check_in); '; END IF;
  SELECT count(*) INTO n FROM tours_guide_availability WHERE guide_id <> v_guide;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'guide sees other guides'' availability; '; END IF;
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_guide_profile, v_variant, v_date, greatest(v_min, 1), 'x', 'x@example.ph', '0', 'BK-TEST-GUIDE');
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'guide creates booking; '; END IF;
  RESET ROLE;

  -- ------------------------------------------------------------ admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_bookings;
  RESET ROLE;
  SELECT count(*) INTO n2 FROM tours_bookings;
  IF n = n2 THEN pass := pass + 1; ELSE fails := fails || 'admin does not see all bookings; '; END IF;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM tours_admin_analytics(current_date - 30, current_date); ok := true; EXCEPTION WHEN others THEN ok := false; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'admin cannot run analytics; '; END IF;
  -- Admin tools manage tours and bookings; they do not book on a tourist's behalf.
  BEGIN
    INSERT INTO tours_bookings (package_id, user_id, price_variant_id, tour_date, number_of_pax, contact_name, contact_email, contact_phone, booking_reference)
    VALUES (v_pkg, v_admin, v_variant, v_date, greatest(v_min, 1), 'x', 'x@example.ph', '0', 'BK-TEST-ADMIN');
    ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'admin creates booking; '; END IF;
  RESET ROLE;

  -- ------------------------------------------------------------ messaging channels
  -- R6: a guide can only be assigned on a day they marked available (and are free).
  UPDATE tours_bookings SET assigned_guide_id = NULL WHERE assigned_guide_id = v_guide AND tour_date = (SELECT tour_date FROM tours_bookings WHERE id = v_booking) AND id <> v_booking;
  INSERT INTO tours_guide_availability (guide_id, available_date, is_available)
  SELECT v_guide, tour_date, true FROM tours_bookings WHERE id = v_booking
  ON CONFLICT (guide_id, available_date) DO UPDATE SET is_available = true;
  UPDATE tours_bookings SET assigned_guide_id = v_guide WHERE id = v_booking;
  -- Tourist <-> guide: private to the two of them.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_gt := tours_open_guide_tourist_conversation(v_booking);
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_gt, 'Where do we meet?');
  ok := tours_open_guide_tourist_conversation(v_booking) = v_gt;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'guide-tourist chat not reused; '; END IF;
  BEGIN PERFORM tours_open_operator_guide_conversation(v_guide, NULL); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'tourist opens operator-guide chat; '; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE link = '/tours/messages/' || v_gt AND profile_id = v_guide_profile;
  SELECT count(*) INTO n2 FROM tours_notifications WHERE link = '/tours/messages/' || v_gt AND profile_id = v_operator_profile;
  IF n = 1 AND n2 = 0 THEN pass := pass + 1; ELSE fails := fails || format('guide-tourist notify guide=%s operator=%s; ', n, n2); END IF;

  -- Operator <-> guide, and operator <-> Tourism Office.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_operator_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_messages WHERE conversation_id = v_gt;
  IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'operator reads guide-tourist chat; '; END IF;
  v_og := tours_open_operator_guide_conversation(v_guide, NULL);
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_og, 'Can you take the Saturday tour?');
  v_oa := tours_open_operator_admin_conversation(NULL);
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_oa, 'When is the permit renewal?');
  pass := pass + 1;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE link = '/tours/messages/' || v_oa AND profile_id = v_admin;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'admin not notified of operator message; '; END IF;

  -- Guide sees both of their chats, not the Tourism Office one.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_guide_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tours_chat_inbox() WHERE conversation_id IN (v_gt, v_og);
  SELECT count(*) INTO n2 FROM tours_chat_inbox() WHERE conversation_id = v_oa;
  IF n = 2 AND n2 = 0 THEN pass := pass + 1; ELSE fails := fails || format('guide inbox gt+og=%s oa=%s; ', n, n2); END IF;
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_gt, 'At the Bagasbas lifeguard tower.');
  BEGIN PERFORM tours_open_operator_admin_conversation(NULL); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'guide opens Tourism Office chat; '; END IF;
  RESET ROLE;

  -- Another tourist sees none of it.
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM tours_messages WHERE conversation_id IN (v_gt, v_og, v_oa);
    BEGIN PERFORM tours_open_guide_tourist_conversation(v_booking); ok := false; EXCEPTION WHEN others THEN ok := true; END;
    IF ok AND n = 0 THEN pass := pass + 1; ELSE fails := fails || 'other tourist reaches private chats; '; END IF;
    RESET ROLE;
  END IF;

  -- Admin answers the operator in the same thread, but cannot post in a booking's private chat.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := tours_open_operator_admin_conversation(v_operator) = v_oa;
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_oa, 'It is due in January.');
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'admin opens a second Tourism Office chat; '; END IF;
  BEGIN INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_gt, 'admin'); ok := false; EXCEPTION WHEN others THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'admin posts in guide-tourist chat; '; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE link = '/tours/messages/' || v_oa AND profile_id = v_operator_profile;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'operator not notified of Tourism Office reply; '; END IF;

  -- ------------------------------------------------------------ tourist <-> Tourism Office (F13 handoff)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tourist, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_id := tours_open_tourist_office_conversation(NULL);
  INSERT INTO tours_messages (conversation_id, message_text) VALUES (v_id, 'My guide did not arrive.');
  IF tours_open_tourist_office_conversation(NULL) = v_id THEN pass := pass + 1; ELSE fails := fails || 'tourist office chat not reused; '; END IF;
  RESET ROLE;
  SELECT count(*) INTO n FROM tours_notifications WHERE link = '/tours/messages/' || v_id AND profile_id = v_admin;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'admin not notified of tourist message; '; END IF;
  IF v_other IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO n FROM tours_messages WHERE conversation_id = v_id;
    IF n = 0 THEN pass := pass + 1; ELSE fails := fails || 'other tourist reads tourist office chat; '; END IF;
    RESET ROLE;
  END IF;

  -- ------------------------------------------------------------ webhook replay
  -- The same PayMongo payment arriving twice is stored once.
  INSERT INTO tours_payment_events (event_id, event_type, livemode, booking_id, payload) VALUES ('evt_test_replay', 'checkout_session.payment.paid', false, v_booking, '{}');
  BEGIN
    INSERT INTO tours_payment_events (event_id, event_type, livemode, booking_id, payload) VALUES ('evt_test_replay', 'checkout_session.payment.paid', false, v_booking, '{}');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'duplicate webhook event stored twice; '; END IF;
  INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider, provider_ref, provider_method)
  VALUES (v_booking, 100, 'gcash', 'completed', 'paymongo', 'pay_test_replay', 'gcash');
  BEGIN
    INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider, provider_ref, provider_method)
    VALUES (v_booking, 100, 'gcash', 'completed', 'paymongo', 'pay_test_replay', 'gcash');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  SELECT total_paid INTO n FROM tours_bookings WHERE id = v_booking;
  IF ok AND n = 100 THEN pass := pass + 1; ELSE fails := fails || format('replayed payment counted (total_paid=%s); ', n); END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass, (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
