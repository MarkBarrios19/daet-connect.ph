-- One-time repair for the verified PayMongo SANDBOX booking BK-20261109-CE5927.
-- Run only after inspecting the linked PayMongo payment/refund in test mode.
-- This updates the cancellation request ONLY: it does not send or record money.
-- It deliberately leaves the existing manual ledger entry unchanged for audit.
-- Run in the Supabase SQL editor after applying 20261129_sync_refund_cancellations.sql.
DO $repair$
DECLARE
  v_booking uuid;
  v_updated integer;
BEGIN
  SELECT b.id INTO v_booking FROM public.tours_bookings b
   WHERE b.booking_reference = 'BK-20261109-CE5927' AND b.status = 'cancelled'
     AND EXISTS (SELECT 1 FROM public.tours_payments p WHERE p.booking_id = b.id
       AND p.provider = 'paymongo' AND p.provider_ref = 'pay_aDDxtAJoUPdZvACVNLmhSne7'
       AND p.payment_status = 'completed' AND p.amount = 600)
     AND EXISTS (SELECT 1 FROM public.tours_payments r WHERE r.booking_id = b.id
       AND r.provider = 'manual' AND r.reference_number = '124123'
       AND r.payment_status = 'refunded' AND r.amount = 600)
     AND public.tours_refundable_amount(b.id) = 0;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Booking or ledger no longer matches the verified test refund. Stop and review before making changes.';
  END IF;
  UPDATE public.tours_cancellations
     SET status = 'refund_confirmed', resolved_at = COALESCE(resolved_at, now())
   WHERE booking_id = v_booking AND status IN ('requested', 'approved');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Updated % cancellation request(s); no payment was sent or added.', v_updated;
END;
$repair$;
