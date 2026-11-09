-- ================================================================
-- Operator online refunds (the bookings board's "Process Refund")
--
-- The operator sends money back two ways:
--
--   PayMongo (Auto)  the app calls PayMongo's refund API and records what it
--                    returns. Those rows carry provider = 'paymongo' and the
--                    refund id (ref_…) in provider_ref, so replaying the same
--                    refund is a no-op (the unique (provider, provider_ref)
--                    index from F1 enforces it).
--   Manual GCash     the operator sends it from their own wallet and records
--                    it, as before: provider = 'manual', one ref they type.
--
-- Both are ledger rows with payment_status = 'refunded' linked to the payment
-- they undo through the new refund_of column, so tours_refundable_amount and
-- the payments ledger keep working unchanged.
--
-- Written without DROP statements, so it can be applied through tooling that
-- requires confirmation for destructive SQL.
-- ================================================================

-- The payment a refund gives back. Manual refunds often leave it null (the
-- operator does not know which instalment they are returning).
ALTER TABLE tours_payments ADD COLUMN IF NOT EXISTS refund_of uuid REFERENCES tours_payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tours_payments_refund_of_idx ON tours_payments (refund_of) WHERE refund_of IS NOT NULL;

-- ----------------------------------------------------------------
-- Record an automatic (PayMongo) refund
--
-- Called after PayMongo accepted the refund. It re-checks everything the
-- database can check by itself — the caller runs the tour, the booking is
-- closed, the amount is inside what was paid online and not already refunded —
-- then writes one ledger row per payment refunded.
--
-- p_rows is a jsonb array of { payment_id, provider_ref, amount }:
--   payment_id    the tours_payments row the money was refunded from
--   provider_ref  the PayMongo refund id (ref_…)
--   amount        pesos, from PayMongo's own echo of the amount
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_record_online_refund(p_booking_id uuid, p_rows jsonb)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  v_row jsonb;
  v_payment tours_payments%ROWTYPE;
  v_amount numeric;
  v_ref text;
  v_online_paid numeric;
  v_refunded numeric;
  v_total_refunded numeric := 0;
  v_method text;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No refund lines to record.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (get_my_role() = 'admin' OR (
    public.tours_is_booking_operator(p_booking_id)
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

  -- Refunded every peso that came in online: the cancellation request is settled.
  SELECT COALESCE(SUM(amount), 0) INTO v_online_paid
    FROM tours_payments
   WHERE booking_id = p_booking_id AND provider = 'paymongo' AND payment_status = 'completed';
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
    FROM tours_payments
   WHERE booking_id = p_booking_id AND payment_status = 'refunded';

  IF v_online_paid > 0 AND v_refunded >= v_online_paid THEN
    UPDATE tours_cancellations
       SET status = 'refund_confirmed', resolved_at = COALESCE(resolved_at, now())
     WHERE booking_id = p_booking_id AND status = 'approved';
  END IF;

  RETURN public.tours_refundable_amount(p_booking_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.tours_record_online_refund(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_record_online_refund(uuid, jsonb) TO authenticated;

-- ----------------------------------------------------------------
-- Ledger: refunds are written by the two functions above only. The manual
-- policy let an operator insert any row on their own booking; keep it, but a
-- row that names a payment (refund_of) must come through a function so the
-- per-payment ceiling above is applied.
-- ----------------------------------------------------------------
ALTER POLICY tours_payments_insert_manual ON tours_payments
  WITH CHECK (
    provider = 'manual' AND provider_ref IS NULL AND refund_of IS NULL
    AND recorded_by = auth.uid()
    AND public.tours_is_booking_operator(booking_id)
  );

-- The ledger's own refund rows are never edited by hand.
ALTER POLICY tours_payments_update_manual ON tours_payments
  USING (provider = 'manual' AND payment_status <> 'refunded' AND public.tours_is_booking_operator(booking_id))
  WITH CHECK (provider = 'manual' AND payment_status <> 'refunded' AND public.tours_is_booking_operator(booking_id));
ALTER POLICY tours_payments_delete_manual ON tours_payments
  USING (provider = 'manual' AND payment_status <> 'refunded' AND public.tours_is_booking_operator(booking_id));
