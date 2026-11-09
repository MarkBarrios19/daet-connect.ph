-- ================================================================
-- "We don't need a tour guide" — a booking that goes ahead without one
--
-- A guest can ask for no guide (usually in chat: "di namin kailangan ng tour
-- guide"). Until now the operator could only clear assigned_guide_id, which
-- looks exactly like a guide they have forgotten to pick: the board, the
-- dashboard and the live page all keep saying "no guide yet".
--
-- This migration records the guest's request on the booking, so the tour is
-- deliberately guideless rather than incomplete:
--
--   1. tours_bookings.guide_not_needed_at / _note — the request and what the
--      operator noted with it.
--   2. A guard trigger: naming a guide answers the request, so the flag is
--      cleared whenever a guide is put back on the booking. The two can never
--      be true at the same time, whichever code path does the writing.
--   3. Clearing the guide cancels any pending swap request for that booking:
--      a guide asking for a substitute is moot once nobody is leading it.
--   4. Notifications: the tourist hears their wish was recorded, and the guide
--      who was taken off the tour hears that too.
--
-- Written without DROP statements, so it can be applied through tooling that
-- requires confirmation for destructive SQL.
-- ================================================================

-- 1. The guest's request ---------------------------------------------

ALTER TABLE public.tours_bookings ADD COLUMN IF NOT EXISTS guide_not_needed_at timestamptz;
ALTER TABLE public.tours_bookings ADD COLUMN IF NOT EXISTS guide_not_needed_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tours_bookings_guide_not_needed_note_len'
  ) THEN
    ALTER TABLE public.tours_bookings
      ADD CONSTRAINT tours_bookings_guide_not_needed_note_len
      CHECK (guide_not_needed_note IS NULL OR char_length(guide_not_needed_note) <= 300);
  END IF;
END
$$;

COMMENT ON COLUMN public.tours_bookings.guide_not_needed_at IS
  'When the guest asked for this tour to go ahead without a guide; NULL means a guide is still expected.';
COMMENT ON COLUMN public.tours_bookings.guide_not_needed_note IS
  'What the operator noted with the request, e.g. "Guest asked in chat".';

-- 2. A guide and "no guide needed" never stand together ------------

CREATE OR REPLACE FUNCTION public.tours_bookings_guide_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Naming a guide answers the request.
  IF NEW.assigned_guide_id IS NOT NULL
     AND NEW.assigned_guide_id IS DISTINCT FROM OLD.assigned_guide_id THEN
    NEW.guide_not_needed_at := NULL;
    NEW.guide_not_needed_note := NULL;
  -- Recording the guest's request takes the guide off, whichever code path
  -- wrote only the flag. The AFTER trigger below then cancels open swaps.
  ELSIF NEW.guide_not_needed_at IS NOT NULL
     AND NEW.guide_not_needed_at IS DISTINCT FROM OLD.guide_not_needed_at THEN
    NEW.assigned_guide_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tours_bookings_guide_request_guard
  BEFORE UPDATE OF assigned_guide_id, guide_not_needed_at ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_guide_request_guard();

-- 3. A tour without a guide has nothing to swap ----------------------

CREATE OR REPLACE FUNCTION public.tours_bookings_guide_cleared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_guide_id IS NULL AND OLD.assigned_guide_id IS NOT NULL THEN
    UPDATE tours_guide_swap_requests
       SET status = 'cancelled',
           decided_at = now(),
           decision_note = COALESCE(decision_note, 'The tour no longer has a guide.')
     WHERE booking_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tours_bookings_guide_cleared
  AFTER UPDATE OF assigned_guide_id, guide_not_needed_at ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_bookings_guide_cleared();

-- 4. Tell the people involved ----------------------------------------
--    Same function as F5, plus the two new branches at the end.

CREATE OR REPLACE FUNCTION public.tours_notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c record;
  v_link text := '/tours/bookings/' || NEW.id;
  v_reason text := COALESCE(NULLIF(btrim(NEW.cancellation_reason), ''), 'No reason given.');
  v_old_guide uuid;
BEGIN
  SELECT * INTO c FROM public.tours_booking_context(NEW.id);

  IF TG_OP = 'INSERT' THEN
    PERFORM tours_notify(c.operator_profile, 'booking_created', 'New booking request',
      format('%s · %s pax · %s', c.title, NEW.number_of_pax, c.tour_day), '/tours/operator/bookings?status=pending');
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM tours_notify(c.tourist, 'booking_confirmed', 'Booking confirmed',
        format('%s on %s is confirmed. Your ticket QR is ready.', c.title, c.tour_day), v_link);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM tours_notify(c.tourist, 'booking_declined', 'Booking declined', format('%s: %s', c.title, v_reason), v_link);
    ELSIF NEW.status = 'cancelled' THEN
      IF NEW.cancelled_by = NEW.user_id THEN
        PERFORM tours_notify(c.operator_profile, 'booking_cancelled', 'A tourist cancelled',
          format('%s · %s (%s): %s', c.reference, c.title, c.tour_day, v_reason), '/tours/operator/bookings');
      ELSIF EXISTS (SELECT 1 FROM tours_cancellations WHERE booking_id = NEW.id AND status = 'requested') THEN
        PERFORM tours_notify(c.tourist, 'cancellation_approved', 'Cancellation approved',
          format('%s on %s is cancelled. Any refund will be sent by the operator.', c.title, c.tour_day), v_link);
      ELSE
        PERFORM tours_notify(c.tourist, 'booking_cancelled', 'Booking cancelled by the operator', format('%s: %s', c.title, v_reason), v_link);
      END IF;
      PERFORM tours_notify(c.guide_profile, 'booking_cancelled', 'Tour cancelled', format('%s on %s was cancelled.', c.title, c.tour_day), '/tours/guide/my-tours');
    ELSIF NEW.status = 'completed' THEN
      PERFORM tours_notify(c.tourist, 'booking_completed', 'How was your tour?',
        format('Thanks for joining %s. Leave a review to help other travellers.', c.title), v_link);
    END IF;
  END IF;

  IF NEW.assigned_guide_id IS DISTINCT FROM OLD.assigned_guide_id AND NEW.assigned_guide_id IS NOT NULL THEN
    PERFORM tours_notify(c.guide_profile, 'guide_assigned', 'New tour assigned',
      format('%s · %s · %s pax', c.title, c.tour_day, NEW.number_of_pax), '/tours/guide/my-tours');
    PERFORM tours_notify(c.tourist, 'guide_assigned', 'Your guide is assigned',
      format('A local guide will lead %s on %s.', c.title, c.tour_day), v_link);
  END IF;

  -- The guide who was leading it is told they are off, unless a call-off or a
  -- cancellation has already told them the tour is not happening.
  IF NEW.assigned_guide_id IS NULL AND OLD.assigned_guide_id IS NOT NULL
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('cancelled', 'rejected') THEN
    SELECT g.profile_id INTO v_old_guide FROM tours_guides g WHERE g.id = OLD.assigned_guide_id;
    PERFORM tours_notify(v_old_guide, 'guide_unassigned', 'Tour taken off your schedule',
      format('%s · %s. The operator will confirm if anything changes.', c.title, c.tour_day), '/tours/guide/my-tours');
  END IF;

  IF NEW.guide_not_needed_at IS NOT NULL AND OLD.guide_not_needed_at IS NULL THEN
    PERFORM tours_notify(c.tourist, 'guide_not_needed', 'No guide for this tour',
      format('%s on %s will go ahead without a guide, as you asked.', c.title, c.tour_day), v_link);
  END IF;

  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE TRIGGER trg_tours_notify_booking_update
  AFTER UPDATE OF status, assigned_guide_id, guide_not_needed_at ON public.tours_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tours_notify_booking_events();

REVOKE ALL ON FUNCTION public.tours_bookings_guide_request_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_bookings_guide_cleared() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tours_notify_booking_events() FROM PUBLIC, anon, authenticated;
