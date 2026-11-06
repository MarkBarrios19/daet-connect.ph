-- Remember each PayMongo checkout session against its booking, so the return
-- page can confirm a payment even when the browser cookie that normally holds
-- the session id is missing (the tourist came back on a different address or
-- browser than the one that started checkout). Server-only: no policies, no
-- grants to anon or authenticated; the app reads and writes it with the admin client.
CREATE TABLE IF NOT EXISTS public.tours_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.tours_bookings(id) ON DELETE CASCADE,
  session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tours_checkout_sessions_booking ON public.tours_checkout_sessions (booking_id, created_at DESC);
ALTER TABLE public.tours_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_checkout_sessions FROM anon, authenticated;
