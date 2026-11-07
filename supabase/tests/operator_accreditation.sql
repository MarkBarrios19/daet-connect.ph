-- Operator accreditation authorization checks for
-- 20261128_operator_accreditation_write_protection.sql.
--
-- Run against a staging project AFTER applying that migration there:
--   psql "$STAGING_DB_URL" -f supabase/tests/operator_accreditation.sql
--
-- The suite uses one existing tourist without an operator row and one admin.
-- It ALWAYS rolls back by ending with a REPORT exception. Read
-- "REPORT pass=N fail=0 []" in that error message. No fixtures survive.

DO $suite$
DECLARE
  pass int := 0;
  fails text := '';
  ok boolean;
  n int;
  v_updated int;
  v_applicant uuid;
  v_admin uuid;
  v_operator uuid;
  v_reviewed_at timestamptz;
BEGIN
  SELECT p.id INTO v_applicant
  FROM public.profiles p
  WHERE p.role = 'tourist'
    AND NOT EXISTS (SELECT 1 FROM public.tours_operators o WHERE o.profile_id = p.id)
  LIMIT 1;
  SELECT p.id INTO v_admin FROM public.profiles p WHERE p.role = 'admin' LIMIT 1;

  IF v_applicant IS NULL OR v_admin IS NULL THEN
    RAISE EXCEPTION 'REPORT setup incomplete: applicant=% admin=%', v_applicant, v_admin;
  END IF;

  -- 1. A direct Data API insert cannot self-approve or forge reviewer data.
  -- The custom PT001 exception also rolls the insert back if an old, vulnerable
  -- grant lets it succeed, allowing the rest of the suite to report cleanly.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := false;
  BEGIN
    INSERT INTO public.tours_operators (
      profile_id, business_name, contact_person, contact_email, contact_phone,
      accreditation_status, accreditation_notes, reviewed_by, reviewed_at
    ) VALUES (
      v_applicant, 'Self-approved Tours', 'Test Applicant', 'applicant@example.ph', '09171234567',
      'approved', 'Forged self-approval', v_applicant, now()
    );
    RAISE EXCEPTION 'self-approved insert succeeded' USING ERRCODE = 'PT001';
  EXCEPTION
    WHEN insufficient_privilege THEN ok := true;
    WHEN OTHERS THEN ok := false;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'authenticated user inserted own approved row; '; END IF;
  RESET ROLE;

  -- 2. The registration action's service-role insert still works and creates
  -- an explicitly pending, unreviewed application.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SET LOCAL ROLE service_role;
  INSERT INTO public.tours_operators (
    profile_id, business_name, contact_person, contact_email, contact_phone,
    business_address, dti_registration_url, business_permit_url, gcash_qr_url,
    accreditation_status, accreditation_notes, reviewed_by, reviewed_at
  ) VALUES (
    v_applicant, 'Pending Test Tours', 'Test Applicant', 'applicant@example.ph', '09171234567',
    'Daet, Camarines Norte', 'test/dti.pdf', 'test/permit.pdf', 'test/gcash.png',
    'pending', NULL, NULL, NULL
  ) RETURNING id INTO v_operator;
  SELECT count(*) INTO n FROM public.tours_operators
  WHERE id = v_operator AND profile_id = v_applicant
    AND accreditation_status = 'pending' AND accreditation_notes IS NULL
    AND reviewed_by IS NULL AND reviewed_at IS NULL;
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'service-role registration did not save a pending application; '; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 3. The owner cannot turn that pending row into an approved one.
  ok := false;
  BEGIN
    UPDATE public.tours_operators
    SET accreditation_status = 'approved'
    WHERE id = v_operator AND profile_id = v_applicant;
    RAISE EXCEPTION 'self-approval update succeeded' USING ERRCODE = 'PT001';
  EXCEPTION
    WHEN insufficient_privilege THEN ok := true;
    WHEN OTHERS THEN ok := false;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'authenticated user approved own pending row; '; END IF;

  -- 4. Notes and reviewer identity/timestamps are admin-only as well.
  ok := false;
  BEGIN
    UPDATE public.tours_operators
    SET accreditation_notes = 'Forged review', reviewed_by = v_applicant, reviewed_at = now()
    WHERE id = v_operator AND profile_id = v_applicant;
    RAISE EXCEPTION 'review metadata update succeeded' USING ERRCODE = 'PT001';
  EXCEPTION
    WHEN insufficient_privilege THEN ok := true;
    WHEN OTHERS THEN ok := false;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'authenticated user forged reviewer metadata; '; END IF;

  -- 5. Ownership and other system-controlled columns are not writable either.
  ok := false;
  BEGIN
    UPDATE public.tours_operators SET profile_id = v_admin WHERE id = v_operator;
    RAISE EXCEPTION 'ownership update succeeded' USING ERRCODE = 'PT001';
  EXCEPTION
    WHEN insufficient_privilege THEN ok := true;
    WHEN OTHERS THEN ok := false;
  END;
  IF ok THEN pass := pass + 1; ELSE fails := fails || 'authenticated user changed operator ownership; '; END IF;
  RESET ROLE;

  -- 6. The verified admin action retains its service-role path: promote the
  -- profile and save the approval plus trustworthy reviewer metadata.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'service_role')::text, true);
  SET LOCAL ROLE service_role;
  UPDATE public.profiles SET role = 'operator' WHERE id = v_applicant AND role = 'tourist';
  UPDATE public.tours_operators
  SET accreditation_status = 'approved', accreditation_notes = NULL,
      reviewed_by = v_admin, reviewed_at = now()
  WHERE id = v_operator AND accreditation_status = 'pending'
  RETURNING reviewed_at INTO v_reviewed_at;
  SELECT count(*) INTO n FROM public.tours_operators o
  JOIN public.profiles p ON p.id = o.profile_id
  WHERE o.id = v_operator AND o.accreditation_status = 'approved'
    AND o.reviewed_by = v_admin AND o.reviewed_at IS NOT NULL
    AND p.role = 'operator';
  IF n = 1 THEN pass := pass + 1; ELSE fails := fails || 'service-role admin review failed; '; END IF;
  RESET ROLE;

  -- 7. All six payment-settings columns remain writable by the owner, without
  -- changing the accreditation decision or reviewer metadata.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.tours_operators
  SET gcash_number = '09179990000', gcash_name = 'Test Applicant',
      bank_name = 'Test Bank', bank_account_number = '1234567890',
      bank_account_name = 'Pending Test Tours',
      payment_instructions = 'Include the booking reference.'
  WHERE id = v_operator AND profile_id = (SELECT auth.uid());
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.tours_operators
  WHERE id = v_operator
    AND gcash_number = '09179990000' AND gcash_name = 'Test Applicant'
    AND bank_name = 'Test Bank' AND bank_account_number = '1234567890'
    AND bank_account_name = 'Pending Test Tours'
    AND payment_instructions = 'Include the booking reference.'
    AND accreditation_status = 'approved' AND reviewed_by = v_admin
    AND reviewed_at = v_reviewed_at AND accreditation_notes IS NULL;
  IF v_updated = 1 AND n = 1 THEN pass := pass + 1; ELSE fails := fails || 'permitted payment settings failed or changed review data; '; END IF;

  -- 8. Mixing an allowed payment field with an admin field rejects the whole
  -- update; the valid payment value cannot be smuggled through in that request.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := false;
  BEGIN
    UPDATE public.tours_operators
    SET gcash_number = '09998887777', accreditation_status = 'pending'
    WHERE id = v_operator;
    RAISE EXCEPTION 'mixed payment/admin update succeeded' USING ERRCODE = 'PT001';
  EXCEPTION
    WHEN insufficient_privilege THEN ok := true;
    WHEN OTHERS THEN ok := false;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.tours_operators
  WHERE id = v_operator AND gcash_number = '09179990000' AND accreditation_status = 'approved';
  IF ok AND n = 1 THEN pass := pass + 1; ELSE fails := fails || 'mixed payment/admin update was not rejected atomically; '; END IF;

  RAISE EXCEPTION 'REPORT pass=% fail=% [%]', pass,
    (length(fails) - length(replace(fails, ';', ''))), fails;
END
$suite$;
