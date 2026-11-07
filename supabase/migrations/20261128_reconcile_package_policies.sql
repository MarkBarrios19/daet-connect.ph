-- ================================================================
-- Reconcile tours_packages RLS with the intended package lifecycle.
--
-- 20261113_package_edit_and_policies.sql removed four loose/duplicate
-- policies, but its replacement CREATE POLICY statements never made it
-- into the repository. The live project received replacements under
-- different names. Keep that historical migration intact and make this
-- the explicit final policy step for both clean and existing databases.
--
-- Prerequisite: the core schema (profiles, tours_operators,
-- tours_packages and the two enums) already exists. This is NOT a
-- replacement for the repository's missing full-schema baseline.
-- See docs/PACKAGE_POLICIES.md for the access matrix and verification.
--
-- Re-runnable: only the known legacy and canonical package policies are
-- replaced. Run the whole file in one transaction so a failure cannot
-- leave the table with its old policies dropped but no replacements.
-- Unknown policies are left alone and flagged by the catalog check.
-- ================================================================

BEGIN;

ALTER TABLE public.tours_packages ENABLE ROW LEVEL SECURITY;

-- Superseded loose policies from fix_rls_policies.sql / 20261113.
DROP POLICY IF EXISTS "Operators can insert their own packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Operators can view their own packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Operators can update their own packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Public can view published packages" ON public.tours_packages;

-- The live ALL policy already includes these two capabilities. Remove
-- the overlapping admin policies instead of carrying three admin rules.
DROP POLICY IF EXISTS "Admins can view all packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Admins can update all packages" ON public.tours_packages;

-- Also drop canonical names so re-running repairs changed expressions
-- or role targets, not just missing policies.
DROP POLICY IF EXISTS "Approved operator creates own draft packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Approved operator updates own draft packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Approved operator deletes own draft packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Operator views own packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Public views published packages" ON public.tours_packages;
DROP POLICY IF EXISTS "Admin manages all packages" ON public.tours_packages;

-- Only an approved operator can create a package, and only as a draft.
CREATE POLICY "Approved operator creates own draft packages"
ON public.tours_packages
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'draft'
  AND operator_id IN (
    SELECT o.id FROM public.tours_operators o
    WHERE o.profile_id = (SELECT auth.uid())
      AND o.accreditation_status = 'approved'
  )
);

-- Direct edits start from an owned draft. The existing live contract
-- permits draft -> pending_review for the legacy submit path; prefer
-- submit_package_for_review, which validates the package before submit.
-- Both predicates repeat ownership/approval: neither the owner nor the
-- accreditation state may be bypassed by the new row. Published and
-- rejected edits go through update_package_and_relations, not this policy.
CREATE POLICY "Approved operator updates own draft packages"
ON public.tours_packages
FOR UPDATE
TO authenticated
USING (
  status = 'draft'
  AND operator_id IN (
    SELECT o.id FROM public.tours_operators o
    WHERE o.profile_id = (SELECT auth.uid())
      AND o.accreditation_status = 'approved'
  )
)
WITH CHECK (
  status IN ('draft', 'pending_review')
  AND operator_id IN (
    SELECT o.id FROM public.tours_operators o
    WHERE o.profile_id = (SELECT auth.uid())
      AND o.accreditation_status = 'approved'
  )
);

CREATE POLICY "Approved operator deletes own draft packages"
ON public.tours_packages
FOR DELETE
TO authenticated
USING (
  status = 'draft'
  AND operator_id IN (
    SELECT o.id FROM public.tours_operators o
    WHERE o.profile_id = (SELECT auth.uid())
      AND o.accreditation_status = 'approved'
  )
);

-- Reading own packages does not require current approval; writing does.
CREATE POLICY "Operator views own packages"
ON public.tours_packages
FOR SELECT
TO authenticated
USING (
  operator_id IN (
    SELECT o.id FROM public.tours_operators o
    WHERE o.profile_id = (SELECT auth.uid())
  )
);

-- PUBLIC intentionally includes both anon and authenticated visitors.
-- This is a read-only policy; it never exposes unpublished packages.
CREATE POLICY "Public views published packages"
ON public.tours_packages
FOR SELECT
TO PUBLIC
USING (status = 'published');

-- Preserve the live admin's full CRUD capability, but explicitly limit
-- the policy to authenticated users and check both old and new rows.
CREATE POLICY "Admin manages all packages"
ON public.tours_packages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

COMMIT;
