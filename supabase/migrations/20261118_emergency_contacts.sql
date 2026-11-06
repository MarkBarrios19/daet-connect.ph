-- Emergency numbers the assistant gives on the trip day (decisions 22 and 32 in
-- docs/TRIP_PLANNER.md). The Tourism Office keeps them at
-- /tours/admin/emergency, each with the date it was last checked. Until any are
-- entered, the assistant gives the national 911 hotline.
--
-- Re-running this file is safe.

CREATE TABLE IF NOT EXISTS public.tours_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('police', 'rescue', 'hospital', 'coast_guard', 'fire', 'tourism', 'other')),
  phone text NOT NULL CHECK (phone ~ '^[0-9+() -]{3,30}$'),
  area text CHECK (area IS NULL OR char_length(area) <= 60),
  checked_on date NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tours_emergency_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tours_emergency_contacts FROM anon, authenticated;
GRANT SELECT ON public.tours_emergency_contacts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tours_emergency_contacts TO authenticated;

DROP POLICY IF EXISTS tours_emergency_contacts_read ON public.tours_emergency_contacts;
CREATE POLICY tours_emergency_contacts_read ON public.tours_emergency_contacts FOR SELECT TO anon, authenticated
  USING (is_active OR get_my_role() = 'admin');
DROP POLICY IF EXISTS tours_emergency_contacts_admin_write ON public.tours_emergency_contacts;
CREATE POLICY tours_emergency_contacts_admin_write ON public.tours_emergency_contacts FOR ALL TO authenticated
  USING (get_my_role() = 'admin') WITH CHECK (get_my_role() = 'admin');
