-- Legacy setup script kept safe to re-run. The canonical live fix is
-- 20261128_operator_accreditation_write_protection.sql.
--
-- Ownership is a row boundary, not permission to write accreditation columns.
-- Column privileges in GRANT_tours_operators_permissions.sql are also required.

ALTER TABLE public.tours_operators ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tours_operators
  ALTER COLUMN accreditation_status SET DEFAULT 'pending',
  ALTER COLUMN accreditation_notes SET DEFAULT NULL,
  ALTER COLUMN reviewed_by SET DEFAULT NULL,
  ALTER COLUMN reviewed_at SET DEFAULT NULL;

-- Policy: Operators can read their own profile
DROP POLICY IF EXISTS "Operators read own profile" ON public.tours_operators;
CREATE POLICY "Operators read own profile"
ON public.tours_operators
FOR SELECT
TO authenticated
USING (profile_id = (SELECT auth.uid()));

-- Policy: Operators can update their own row, subject to the payment-column
-- privilege allowlist. Business applications are resubmitted by the server.
DROP POLICY IF EXISTS "Operators update own profile" ON public.tours_operators;
CREATE POLICY "Operators update own profile"
ON public.tours_operators
FOR UPDATE
TO authenticated
USING (profile_id = (SELECT auth.uid()))
WITH CHECK (profile_id = (SELECT auth.uid()));

-- Policy: Admins can read all operators
DROP POLICY IF EXISTS "Admins read all operators" ON public.tours_operators;
CREATE POLICY "Admins read all operators"
ON public.tours_operators
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
    AND profiles.role = 'admin'
  )
);

-- Applications must start pending and unreviewed even if broader INSERT
-- privileges are accidentally granted in the future.
DROP POLICY IF EXISTS "Users create operator profile" ON public.tours_operators;
CREATE POLICY "Users create operator profile"
ON public.tours_operators
FOR INSERT
TO authenticated
WITH CHECK (
  profile_id = (SELECT auth.uid())
  AND accreditation_status = 'pending'
  AND accreditation_notes IS NULL
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);
