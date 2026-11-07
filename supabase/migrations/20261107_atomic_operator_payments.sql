-- Apply through the normal migration process, not against a live database from tests.
-- Both operator payment paths take the same booking lock before checking the ledger.
BEGIN;

CREATE OR REPLACE FUNCTION public.tours_record_operator_payment(
  p_booking_id uuid, p_amount numeric, p_method text, p_reference text,
  p_payment_date timestamptz, p_notes text, p_proof_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b public.tours_bookings%ROWTYPE;
  proof public.tours_payment_proofs%ROWTYPE;
  v_amount numeric;
  v_method text;
  v_paid numeric;
  v_payment_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tours_is_booking_operator(p_booking_id) THEN
    RAISE EXCEPTION 'Not authorized to record payments for this booking.' USING ERRCODE = '42501';
  END IF;
  IF p_proof_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved operators can verify payments.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM public.tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_proof_id IS NOT NULL THEN
    SELECT * INTO proof FROM public.tours_payment_proofs
      WHERE id = p_proof_id AND booking_id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR proof.verification_status <> 'pending' THEN
      RAISE EXCEPTION 'This receipt was already reviewed.' USING ERRCODE = 'P0002';
    END IF;
    v_amount := proof.amount;
    v_method := CASE WHEN proof.payment_method IN ('gcash', 'bank_transfer') THEN proof.payment_method ELSE 'other' END;
  ELSE
    v_amount := p_amount;
    v_method := p_method;
  END IF;
  IF v_amount IS NULL OR v_amount = 'NaN'::numeric OR v_amount <= 0 OR v_amount <> round(v_amount, 2) THEN
    RAISE EXCEPTION 'Amount must be greater than zero and have at most two decimal places.' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.tours_payments
    WHERE booking_id = p_booking_id AND payment_status = 'completed';
  IF v_amount > b.total_amount - v_paid THEN
    RETURN jsonb_build_object('status', 'exceeds_balance', 'remaining', greatest(0, b.total_amount - v_paid), 'amount', v_amount);
  END IF;

  INSERT INTO public.tours_payments (booking_id, amount, payment_method, payment_status, reference_number, payment_date, notes, recorded_by)
  VALUES (p_booking_id, v_amount, v_method, 'completed',
    CASE WHEN p_proof_id IS NULL THEN p_reference ELSE proof.reference_number END,
    CASE WHEN p_proof_id IS NULL THEN p_payment_date ELSE proof.submitted_at END,
    CASE WHEN p_proof_id IS NULL THEN p_notes ELSE 'Verified from uploaded receipt' END, auth.uid())
  RETURNING id INTO v_payment_id;
  IF p_proof_id IS NOT NULL THEN
    UPDATE public.tours_payment_proofs SET verification_status = 'verified', verified_by = auth.uid(),
      verified_at = now(), rejection_reason = NULL, payment_id = v_payment_id WHERE id = p_proof_id;
  END IF;
  RETURN jsonb_build_object('status', 'recorded', 'remaining', b.total_amount - v_paid - v_amount, 'amount', v_amount);
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_record_operator_payment(uuid, numeric, text, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_record_operator_payment(uuid, numeric, text, text, timestamptz, text, uuid) TO authenticated;
COMMIT;
