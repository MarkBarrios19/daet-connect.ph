-- Durable, fail-closed reservations for refunds. Apply after 20261129.
-- No existing refund is retried or altered by this migration.
CREATE TABLE public.tours_refund_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id),
  payment_id uuid NOT NULL REFERENCES public.tours_payments(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 1),
  requested_by uuid NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','sending','pending','succeeded','failed')),
  provider_ref text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tours_one_active_refund_per_booking ON public.tours_refund_operations(booking_id)
  WHERE state IN ('reserved','sending','pending');
ALTER TABLE public.tours_refund_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tours_refund_operations_read ON public.tours_refund_operations FOR SELECT TO authenticated
  USING (public.tours_is_booking_operator(booking_id) OR COALESCE(public.get_my_role() = 'admin', false));
GRANT SELECT ON public.tours_refund_operations TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.tours_refund_operations FROM PUBLIC, anon, authenticated;

-- Existing direct manual inserts must not bypass the reservation or refund ceiling.
ALTER POLICY tours_payments_insert_manual ON public.tours_payments WITH CHECK (
  provider = 'manual' AND provider_ref IS NULL AND refund_of IS NULL
  AND payment_status <> 'refunded' AND recorded_by = auth.uid()
  AND public.tours_is_booking_operator(booking_id)
);
-- The old client-callable RPC trusts caller-supplied provider references. Only
-- the service-side verified operation below may create online refund rows.
REVOKE ALL ON FUNCTION public.tours_record_online_refund(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.tours_reserve_online_refund(p_booking_id uuid, p_payment_id uuid, p_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE b tours_bookings%ROWTYPE; p tours_payments%ROWTYPE; v_id uuid; v_refunded numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (COALESCE(public.get_my_role() = 'admin', false) OR (
    COALESCE(public.tours_is_booking_operator(p_booking_id), false)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  )) THEN RAISE EXCEPTION 'Not authorized to refund this booking.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status NOT IN ('cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Cancel or decline the booking before refunding.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM tours_refund_operations WHERE booking_id = p_booking_id AND state IN ('reserved','sending','pending')) THEN
    RAISE EXCEPTION 'A PayMongo refund is already in progress or needs reconciliation.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO p FROM tours_payments WHERE id = p_payment_id AND booking_id = p_booking_id
    AND provider = 'paymongo' AND payment_status = 'completed' AND provider_ref ~ '^pay_[A-Za-z0-9]+$';
  IF NOT FOUND THEN RAISE EXCEPTION 'PayMongo payment not found.' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded FROM tours_payments WHERE refund_of = p.id AND payment_status = 'refunded';
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount < 1 OR p_amount <> round(p_amount, 2)
    OR p_amount > p.amount - v_refunded OR p_amount > public.tours_refundable_amount(p_booking_id) THEN
    RAISE EXCEPTION 'Refund exceeds the available balance.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO tours_refund_operations(booking_id, payment_id, amount, requested_by)
    VALUES (p_booking_id, p_payment_id, p_amount, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_reserve_online_refund(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_reserve_online_refund(uuid,uuid,numeric) TO authenticated;

-- Lock the same booking row as the reservation before recording manual money.
CREATE OR REPLACE FUNCTION public.tours_record_refund(p_booking_id uuid, p_amount numeric, p_method text, p_reference text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE b tours_bookings%ROWTYPE; v_refundable numeric; v_ledger_method text;
BEGIN
  IF auth.uid() IS NULL OR NOT (COALESCE(get_my_role() = 'admin', false) OR (
    COALESCE(public.tours_is_booking_operator(p_booking_id), false)
    AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved')
  )) THEN RAISE EXCEPTION 'Only the approved operator of this booking can record a refund.' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR b.status NOT IN ('cancelled','rejected') THEN
    RAISE EXCEPTION 'Cancel or decline the booking before recording a refund.' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM tours_refund_operations WHERE booking_id = p_booking_id AND state IN ('reserved','sending','pending')) THEN
    RAISE EXCEPTION 'A PayMongo refund is in progress or needs reconciliation. Do not record another refund.' USING ERRCODE = 'check_violation'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('gcash','bank_transfer','cash','other') THEN
    RAISE EXCEPTION 'Choose how you refunded.' USING ERRCODE = 'check_violation'; END IF;
  v_refundable := public.tours_refundable_amount(p_booking_id);
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount <= 0 OR p_amount > v_refundable THEN
    RAISE EXCEPTION 'You can refund at most %.', to_char(v_refundable, 'FM999999990.00') USING ERRCODE = 'check_violation'; END IF;
  v_ledger_method := CASE WHEN p_method IN ('gcash','bank_transfer','cash') THEN p_method ELSE 'other' END;
  INSERT INTO tours_payments (booking_id,amount,payment_method,payment_status,provider,reference_number,payment_date,notes,recorded_by)
    VALUES (p_booking_id,p_amount,v_ledger_method,'refunded','manual',NULLIF(trim(COALESCE(p_reference,'')),''),now(),'Refund',auth.uid());
  PERFORM public.tours_sync_refund_cancellation(p_booking_id);
  RETURN v_refundable - p_amount;
END;
$fn$;

-- Only server-side code with the service key may advance a reservation, after
-- validating the authoritative PayMongo response. Uncertain outcomes stay held.
CREATE FUNCTION public.tours_update_refund_operation(p_id uuid, p_state text, p_ref text DEFAULT NULL,
  p_payment_ref text DEFAULT NULL, p_centavos integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE op tours_refund_operations%ROWTYPE; p tours_payments%ROWTYPE;
BEGIN
  SELECT * INTO op FROM tours_refund_operations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund operation not found.'; END IF;
  PERFORM 1 FROM tours_bookings WHERE id = op.booking_id FOR UPDATE;
  SELECT * INTO op FROM tours_refund_operations WHERE id = p_id FOR UPDATE;
  SELECT * INTO p FROM tours_payments WHERE id = op.payment_id AND booking_id = op.booking_id;
  IF p_state = 'sending' THEN
    IF op.state <> 'reserved' THEN RAISE EXCEPTION 'Refund already started.'; END IF;
    UPDATE tours_refund_operations SET state = 'sending', updated_at = now() WHERE id = p_id;
    RETURN;
  END IF;
  IF p_state NOT IN ('pending','succeeded','failed')
     OR p_ref IS NULL OR p_ref !~ '^ref_[A-Za-z0-9]+$' OR (op.provider_ref IS NOT NULL AND op.provider_ref <> p_ref)
     OR p_payment_ref IS DISTINCT FROM p.provider_ref OR p_centavos IS DISTINCT FROM (op.amount * 100)::integer THEN
    RAISE EXCEPTION 'Refund response does not match reservation.';
  END IF;
  -- Concurrent polling and webhook deliveries may have observed the same
  -- refund. Replaying a terminal result or a stale pending snapshot is a no-op.
  IF op.state IN ('succeeded','failed') AND (p_state = op.state OR p_state = 'pending') THEN RETURN; END IF;
  IF op.state NOT IN ('sending','pending') THEN RAISE EXCEPTION 'Refund operation is not active.'; END IF;
  UPDATE tours_refund_operations SET state = p_state, provider_ref = p_ref, updated_at = now() WHERE id = p_id;
  IF p_state = 'succeeded' THEN
    INSERT INTO tours_payments (booking_id,amount,payment_method,payment_status,provider,provider_ref,reference_number,payment_date,notes,recorded_by,refund_of)
    VALUES (op.booking_id,op.amount,
      CASE WHEN p.payment_method IN ('cash','gcash','bank_transfer','credit_card','debit_card','paypal','other') THEN p.payment_method ELSE 'other' END,
      'refunded','paymongo',p_ref,p_ref,now(),'Refund via PayMongo',op.requested_by,p.id);
    PERFORM public.tours_sync_refund_cancellation(op.booking_id);
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.tours_update_refund_operation(uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tours_update_refund_operation(uuid,text,text,text,integer) TO service_role;
