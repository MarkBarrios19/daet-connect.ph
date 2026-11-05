-- ================================================================
-- Trip planner M5: the operator calls a trip off (weather or safety)
-- and the traveller chooses a new date or a full refund.
--
-- A called-off booking stays 'confirmed' while the traveller decides,
-- so nothing else in the booking lifecycle changes:
--   operator  tours_call_off_booking(id, reason)      -> called_off_at, reason; tourist and guide notified
--   tourist   tours_reschedule_called_off(id, date)   -> new tour_date (seats checked), resolution 'rescheduled'
--   tourist   tours_refund_called_off(id)             -> status 'cancelled', resolution 'refund_requested';
--             the operator then records the refund with the existing
--             tours_record_refund (ledger row), as for any cancellation.
-- Idempotent: safe to run twice.
-- ================================================================

ALTER TABLE public.tours_bookings
  ADD COLUMN IF NOT EXISTS called_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS called_off_reason text CHECK (called_off_reason IS NULL OR char_length(called_off_reason) BETWEEN 5 AND 300),
  ADD COLUMN IF NOT EXISTS call_off_resolution text CHECK (call_off_resolution IS NULL OR call_off_resolution IN ('rescheduled', 'refund_requested')),
  ADD COLUMN IF NOT EXISTS rescheduled_from date;

CREATE INDEX IF NOT EXISTS idx_tours_bookings_called_off
  ON public.tours_bookings (user_id) WHERE called_off_at IS NOT NULL AND call_off_resolution IS NULL;

-- ----------------------------------------------------------------
-- Lifecycle guard: same rules as before (20261026_f2_booking_integrity),
-- plus one path: a traveller taking the refund for a trip the operator
-- called off cancels a confirmed booking (as the system, not as a
-- tourist cancellation, which needs the operator's approval).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_bookings_status_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_actor text;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor := 'system';
  ELSIF get_my_role() = 'admin' THEN
    v_actor := 'admin';
  ELSIF current_setting('tours.call_off_refund', true) = 'on' AND OLD.user_id = auth.uid() AND OLD.called_off_at IS NOT NULL THEN
    v_actor := 'system';
  ELSIF current_setting('tours.tourist_cancel', true) = 'on' AND OLD.user_id = auth.uid() THEN
    v_actor := 'tourist';
  ELSIF public.tours_is_booking_operator(OLD.id) THEN
    v_actor := 'operator';
  ELSE
    RAISE EXCEPTION 'You are not allowed to change this booking.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status IN ('completed', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'This booking is already %.', OLD.status USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'rejected') AND v_actor <> 'tourist' THEN
    NULL;
  ELSIF OLD.status = 'pending' AND NEW.status = 'cancelled'
        AND (v_actor <> 'tourist' OR COALESCE(OLD.total_paid, 0) = 0) THEN
    NULL;
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'completed' AND v_actor <> 'tourist' THEN
    IF OLD.tour_date > v_today THEN
      RAISE EXCEPTION 'A tour can be marked completed on or after the tour date.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'confirmed' AND NEW.status = 'cancelled' AND v_actor <> 'tourist' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'A % booking cannot become %.', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelled' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

-- ----------------------------------------------------------------
-- Operator calls a trip off
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_call_off_booking(p_booking_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  c record;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF NOT (
    get_my_role() = 'admin'
    OR (public.tours_is_booking_operator(p_booking_id)
        AND EXISTS (SELECT 1 FROM tours_operators WHERE profile_id = auth.uid() AND accreditation_status = 'approved'))
  ) THEN
    RAISE EXCEPTION 'Only the approved operator of this booking can call it off.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 300 THEN
    RAISE EXCEPTION 'Tell the traveller why the trip is called off (5 to 300 characters).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed booking can be called off.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.tour_date < v_today THEN
    RAISE EXCEPTION 'This trip date has passed.' USING ERRCODE = 'check_violation';
  END IF;
  IF b.called_off_at IS NOT NULL AND b.call_off_resolution IS NULL THEN
    RAISE EXCEPTION 'This trip is already called off; the traveller is choosing a new date or a refund.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE tours_bookings
     SET called_off_at = now(), called_off_reason = v_reason, call_off_resolution = NULL
   WHERE id = b.id;

  SELECT * INTO c FROM public.tours_booking_context(b.id);
  PERFORM tours_notify(c.tourist, 'trip_called_off', 'Your trip is called off',
    format('%s on %s: %s Pick a new date or get a full refund.', c.title, c.tour_day, v_reason), '/tours/bookings/' || b.id);
  PERFORM tours_notify(c.guide_profile, 'trip_called_off', 'Trip called off',
    format('%s on %s was called off: %s', c.title, c.tour_day, v_reason), '/tours/guide/my-tours');
END;
$fn$;

-- ----------------------------------------------------------------
-- Traveller picks a new date
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_reschedule_called_off(p_booking_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
  c record;
  v_slot tours_package_availability%ROWTYPE;
  v_uses_calendar boolean;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status <> 'confirmed' OR b.called_off_at IS NULL OR b.call_off_resolution IS NOT NULL THEN
    RAISE EXCEPTION 'This booking has no called-off trip to reschedule.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date IS NULL OR p_date <= v_today OR p_date > v_today + 365 THEN
    RAISE EXCEPTION 'Pick a date from tomorrow up to a year ahead.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_date = b.tour_date THEN
    RAISE EXCEPTION 'Pick a different date.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM tours_package_availability WHERE package_id = b.package_id) INTO v_uses_calendar;
  IF v_uses_calendar THEN
    SELECT * INTO v_slot FROM tours_package_availability
     WHERE package_id = b.package_id AND available_date = p_date FOR UPDATE;
    IF NOT FOUND OR v_slot.capacity_total - public.tours_count_booked_seats(b.package_id, p_date) < b.number_of_pax THEN
      RAISE EXCEPTION 'That date is not open or has fewer than % seat(s) left.', b.number_of_pax USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE tours_bookings
     SET rescheduled_from = b.tour_date, tour_date = p_date, call_off_resolution = 'rescheduled'
   WHERE id = b.id;

  SELECT * INTO c FROM public.tours_booking_context(b.id);
  PERFORM tours_notify(c.operator_profile, 'trip_rescheduled', 'Called-off trip moved',
    format('%s · %s moved to %s.', c.reference, c.title, c.tour_day), '/tours/operator/bookings');
  PERFORM tours_notify(c.guide_profile, 'trip_rescheduled', 'Trip moved',
    format('%s moved to %s.', c.title, c.tour_day), '/tours/guide/my-tours');
END;
$fn$;

-- ----------------------------------------------------------------
-- Traveller takes the full refund
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tours_refund_called_off(p_booking_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  b tours_bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM tours_bookings WHERE id = p_booking_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF b.status <> 'confirmed' OR b.called_off_at IS NULL OR b.call_off_resolution IS NOT NULL THEN
    RAISE EXCEPTION 'This booking has no called-off trip to refund.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('tours.call_off_refund', 'on', true);
  UPDATE tours_bookings
     SET status = 'cancelled', call_off_resolution = 'refund_requested',
         cancellation_reason = left('Trip called off by the operator (' || b.called_off_reason || '). Full refund requested.', 500),
         cancelled_by = auth.uid(), cancelled_at = now()
   WHERE id = b.id;
  PERFORM set_config('tours.call_off_refund', 'off', true);
  -- The booking-events trigger tells the operator ("A tourist cancelled", with this reason).
  RETURN CASE WHEN COALESCE(b.total_paid, 0) > 0 THEN 'refund_due' ELSE 'nothing_paid' END;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.tours_call_off_booking(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_reschedule_called_off(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tours_refund_called_off(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_call_off_booking(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_reschedule_called_off(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tours_refund_called_off(uuid) TO authenticated;
