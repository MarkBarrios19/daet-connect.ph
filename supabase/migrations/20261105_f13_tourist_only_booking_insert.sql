-- Booking creation belongs to tourist accounts only. Keep the account-owner
-- check and add the role check to the named policy from f1.
ALTER POLICY tours_bookings_insert ON public.tours_bookings
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() = 'tourist'
  );

-- Restrictive policies are ANDed with every permissive INSERT policy, so an
-- older permissive policy cannot accidentally reopen booking creation for staff.
DROP POLICY IF EXISTS tours_bookings_tourist_only_insert ON public.tours_bookings;
CREATE POLICY tours_bookings_tourist_only_insert
  ON public.tours_bookings
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() = 'tourist'
  );
