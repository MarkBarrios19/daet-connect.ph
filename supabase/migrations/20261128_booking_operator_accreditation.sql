-- Booking ownership is not sufficient: accreditation must be current on the
-- operator row that owns this package. Existing RLS, realtime and workflow
-- functions call this predicate on each request (including after revocation).
CREATE OR REPLACE FUNCTION public.tours_is_booking_operator(p_booking_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM tours_bookings b
    JOIN tours_packages p ON p.id = b.package_id
    JOIN tours_operators o ON o.id = p.operator_id
    WHERE b.id = p_booking_id AND o.profile_id = auth.uid()
      AND o.accreditation_status = 'approved'
  );
$fn$;

-- Admins retain independent access even when they have no operator record.
ALTER POLICY tours_payment_proofs_select ON public.tours_payment_proofs
  USING (public.tours_is_booking_tourist(booking_id) OR public.tours_is_booking_operator(booking_id) OR public.get_my_role() = 'admin');
ALTER POLICY tours_payment_proofs_operator_update ON public.tours_payment_proofs
  USING (public.tours_is_booking_operator(booking_id) OR public.get_my_role() = 'admin')
  WITH CHECK (public.tours_is_booking_operator(booking_id) OR public.get_my_role() = 'admin');

-- Swap reads and the SECURITY DEFINER decision RPC used a separate ownership
-- check; both must use the same accredited booking-owner predicate.
ALTER POLICY "Swap requests are visible to the people involved" ON public.tours_guide_swap_requests
  USING (public.get_my_role() = 'admin'
    OR EXISTS (SELECT 1 FROM public.tours_guides g WHERE g.profile_id = (SELECT auth.uid()) AND g.id IN (from_guide_id, to_guide_id))
    OR public.tours_is_booking_operator(booking_id));

CREATE OR REPLACE FUNCTION public.tours_decide_guide_swap(p_request uuid, p_approve boolean, p_guide uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r tours_guide_swap_requests;
  v_booking tours_bookings;
  v_new uuid;
  v_from_profile uuid;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  c record;
BEGIN
  SELECT * INTO r FROM tours_guide_swap_requests WHERE id = p_request FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'swap:not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_booking FROM tours_bookings WHERE id = r.booking_id FOR UPDATE;
  SELECT * INTO c FROM tours_booking_context(r.booking_id);
  IF NOT public.tours_is_booking_operator(r.booking_id) AND COALESCE(get_my_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'swap:not_your_booking' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'swap:already_decided' USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.tour_date < (now() AT TIME ZONE 'Asia/Manila')::date OR v_booking.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'swap:tour_closed' USING ERRCODE = 'P0001';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'swap:note' USING ERRCODE = 'P0001';
  END IF;
  SELECT profile_id INTO v_from_profile FROM tours_guides WHERE id = r.from_guide_id;

  IF NOT p_approve THEN
    UPDATE tours_guide_swap_requests SET status = 'rejected', decided_by = auth.uid(), decision_note = v_note, decided_at = now() WHERE id = r.id;
    PERFORM tours_notify(v_from_profile, 'guide_swap_rejected', 'Swap request declined',
      format('%s (%s): you stay on this tour.%s', c.title, c.tour_day, COALESCE(' ' || v_note, '')), '/tours/guide/my-tours');
    RETURN;
  END IF;

  v_new := COALESCE(p_guide, r.to_guide_id);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'swap:choose_guide' USING ERRCODE = 'P0001';
  END IF;
  IF v_new = r.from_guide_id OR NOT tours_guide_is_free(v_new, v_booking.tour_date, v_booking.id) THEN
    RAISE EXCEPTION 'swap:guide_not_free' USING ERRCODE = 'P0001';
  END IF;

  UPDATE tours_guide_swap_requests
     SET status = 'approved', to_guide_id = v_new, decided_by = auth.uid(), decision_note = v_note, decided_at = now()
   WHERE id = r.id;
  -- The schedule guard re-checks; tours_notify_booking_events tells the new guide and the tourist.
  UPDATE tours_bookings SET assigned_guide_id = v_new WHERE id = v_booking.id;
  PERFORM tours_notify(v_from_profile, 'guide_swap_approved', 'Swap approved',
    format('%s (%s) now has another guide. Thanks for the heads-up.', c.title, c.tour_day), '/tours/guide/my-tours');
END;
$$;

-- This SECURITY DEFINER aggregate was callable with any booking ID. Restrict
-- it to the booking's parties and admins, like the underlying payment reads.
CREATE OR REPLACE FUNCTION public.tours_refundable_amount(p_booking_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_amount numeric;
BEGIN
  IF NOT (public.tours_is_booking_tourist(p_booking_id)
    OR public.tours_is_booking_operator(p_booking_id)
    OR COALESCE(public.get_my_role(), '') = 'admin') THEN
    RAISE EXCEPTION 'Not allowed to view this balance.' USING ERRCODE = '42501';
  END IF;
  SELECT GREATEST(0, COALESCE(SUM(amount) FILTER (WHERE payment_status = 'completed'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE payment_status = 'refunded'), 0))
    INTO v_amount FROM public.tours_payments WHERE booking_id = p_booking_id;
  RETURN v_amount;
END;
$fn$;
