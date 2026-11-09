-- Keep cancellation requests in sync when a refund is recorded.
-- Apply after 20261128_operator_online_refunds.sql. This never sends a refund.
-- Existing records are NOT backfilled; review them separately before repair.
-- The same booking lock used by both refund RPCs protects the reconciliation.
CREATE OR REPLACE FUNCTION public.tours_sync_refund_cancellation(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_paid numeric;
  v_refunded numeric;
BEGIN
  -- Do not change requests on active bookings or revive declined requests.
  IF NOT EXISTS (SELECT 1 FROM tours_bookings WHERE id = p_booking_id AND status IN ('cancelled', 'rejected')) THEN
    RETURN;
  END IF;
  SELECT COALESCE(SUM(amount) FILTER (WHERE payment_status = 'completed'), 0),
         COALESCE(SUM(amount) FILTER (WHERE payment_status = 'refunded'), 0)
    INTO v_paid, v_refunded FROM tours_payments WHERE booking_id = p_booking_id;
  IF v_paid <= 0 OR v_refunded <= 0 THEN
    RETURN;
  END IF;
  IF v_refunded >= v_paid THEN
    UPDATE tours_cancellations
       SET status = 'refund_confirmed', resolved_at = COALESCE(resolved_at, now()),
           resolved_by = COALESCE(resolved_by, auth.uid())
     WHERE booking_id = p_booking_id AND status IN ('requested', 'approved');
  ELSE
    UPDATE tours_cancellations
       SET status = 'approved', resolved_at = COALESCE(resolved_at, now()),
           resolved_by = COALESCE(resolved_by, auth.uid())
     WHERE booking_id = p_booking_id AND status = 'requested';
  END IF;
END;
$fn$;

-- Only the existing authorized SECURITY DEFINER refund RPCs may call the helper.
REVOKE ALL ON FUNCTION public.tours_sync_refund_cancellation(uuid) FROM PUBLIC, anon, authenticated;

-- Re-create the existing refund RPCs with cancellation synchronization.
CREATE OR REPLACE FUNCTION public.tours_record_refund(p_booking_id uuid, p_amount numeric, p_method text, p_reference text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_refundable numeric;
  v_ledger_method text;
BEGIN
  IF auth.uid() IS NULL OR NOT (COALESCE(get_my_role() = 'admin', false) OR (
    COALESCE(public.tours_is_booking_operator(p_booking_id), false)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  )) THEN
    RAISE EXCEPTION 'Only the approved operator of this booking can record a refund.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status NOT IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Cancel or decline the booking before recording a refund.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_method NOT IN ('gcash', 'bank_transfer', 'cash', 'other') THEN
    RAISE EXCEPTION 'Choose how you refunded.' USING ERRCODE = 'check_violation';
  END IF;

  v_refundable := public.tours_refundable_amount(p_booking_id);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_refundable THEN
    RAISE EXCEPTION 'You can refund at most %.', to_char(v_refundable, 'FM999999990.00') USING ERRCODE = 'check_violation';
  END IF;

  v_ledger_method := CASE WHEN p_method IN ('gcash', 'bank_transfer', 'cash') THEN p_method ELSE 'other' END;
  INSERT INTO tours_payments (booking_id, amount, payment_method, payment_status, provider, reference_number, payment_date, notes, recorded_by)
  VALUES (p_booking_id, p_amount, v_ledger_method, 'refunded', 'manual', NULLIF(trim(COALESCE(p_reference, '')), ''), now(), 'Refund', auth.uid());

  PERFORM public.tours_sync_refund_cancellation(p_booking_id);
  RETURN v_refundable - p_amount;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.tours_record_online_refund(p_booking_id uuid, p_rows jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_row jsonb;
  v_payment tours_payments%ROWTYPE;
  v_amount numeric;
  v_ref text;
  v_total_refunded numeric := 0;
  v_method text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No refund lines to record.' USING ERRCODE = 'check_violation';
  END IF;

  IF auth.uid() IS NULL OR NOT (COALESCE(get_my_role() = 'admin', false) OR (
    COALESCE(public.tours_is_booking_operator(p_booking_id), false)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  )) THEN
    RAISE EXCEPTION 'Only the approved operator of this booking can record a refund.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status NOT IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Cancel or decline the booking before refunding it.' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_ref := btrim(COALESCE(v_row->>'provider_ref', ''));
    IF v_ref = '' OR v_ref !~ '^ref_[A-Za-z0-9]+$' THEN
      RAISE EXCEPTION 'A refund reference from PayMongo is missing.' USING ERRCODE = 'check_violation';
    END IF;

    -- Replaying a refund (a retried request, a double tap) must not pay twice.
    IF EXISTS (SELECT 1 FROM tours_payments WHERE provider = 'paymongo' AND provider_ref = v_ref) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_payment FROM tours_payments
     WHERE id = (v_row->>'payment_id')::uuid AND booking_id = p_booking_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'That payment is not on this booking.' USING ERRCODE = 'check_violation';
    END IF;

    v_amount := round(COALESCE((v_row->>'amount')::numeric, 0), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'A refund needs an amount.' USING ERRCODE = 'check_violation';
    END IF;

    -- What this payment still has left after earlier refunds against it.
    IF v_amount > GREATEST(0, v_payment.amount - COALESCE((
      SELECT SUM(r.amount) FROM tours_payments r
       WHERE r.refund_of = v_payment.id AND r.payment_status = 'refunded'
    ), 0)) THEN
      RAISE EXCEPTION 'PayMongo already refunded all but % of that payment.', to_char(
        GREATEST(0, v_payment.amount - COALESCE((
          SELECT SUM(r.amount) FROM tours_payments r
           WHERE r.refund_of = v_payment.id AND r.payment_status = 'refunded'
        ), 0)), 'FM999999990.00') USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO tours_payments (
      booking_id, amount, payment_method, payment_status, provider, provider_ref,
      reference_number, payment_date, notes, recorded_by, refund_of
    ) VALUES (
      p_booking_id, v_amount,
      CASE WHEN v_payment.payment_method IN ('cash', 'gcash', 'bank_transfer', 'credit_card', 'debit_card', 'paypal', 'other')
           THEN v_payment.payment_method ELSE 'other' END,
      'refunded', 'paymongo', v_ref,
      v_ref, now(), 'Refund via PayMongo', auth.uid(), v_payment.id
    );

    v_total_refunded := v_total_refunded + v_amount;
  END LOOP;

  PERFORM public.tours_sync_refund_cancellation(p_booking_id);

  RETURN public.tours_refundable_amount(p_booking_id);
END;
$fn$;


-- Keep the public RPCs available only to signed-in users; each still verifies
-- that the caller is an approved operator for this booking or an admin.
REVOKE ALL ON FUNCTION public.tours_record_refund(uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tours_record_online_refund(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_record_refund(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_record_online_refund(uuid, jsonb) TO authenticated;
