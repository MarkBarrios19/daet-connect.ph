-- Prevent operator self-approval through the Supabase Data API.
--
-- RLS ownership checks do not restrict which columns a user can write. The
-- older table-wide INSERT/UPDATE grant therefore let an authenticated user
-- approve their own application and forge its review metadata, bypassing the
-- fixed payloads in the registration and payment-settings Server Actions.
--
-- Browser writes are now limited to applicant-owned columns. Registration and
-- resubmission still use the verified service-role Server Action, as does the
-- admin review flow. The only direct updates operators need are payment
-- settings. Do not replace these grants with a table-wide INSERT/UPDATE grant.

BEGIN;

-- Safe defaults also make a direct application insert possible without giving
-- authenticated users privileges on accreditation or reviewer columns.
ALTER TABLE public.tours_operators
  ALTER COLUMN accreditation_status SET DEFAULT 'pending',
  ALTER COLUMN accreditation_notes SET DEFAULT NULL,
  ALTER COLUMN reviewed_by SET DEFAULT NULL,
  ALTER COLUMN reviewed_at SET DEFAULT NULL;

ALTER TABLE public.tours_operators ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Operators update own profile" ON public.tours_operators;
CREATE POLICY "Operators update own profile"
ON public.tours_operators
FOR UPDATE
TO authenticated
USING (profile_id = (SELECT auth.uid()))
WITH CHECK (profile_id = (SELECT auth.uid()));

-- A column-level REVOKE alone is insufficient when a table-level grant exists:
-- PostgreSQL's table-level grant still covers every column. Remove the broad
-- grant first, then grant explicit allowlists. SELECT remains available and is
-- still constrained by the existing own-row/admin RLS policies.
REVOKE INSERT, UPDATE ON TABLE public.tours_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tours_operators TO authenticated;

GRANT INSERT (
  profile_id,
  business_name,
  contact_person,
  contact_email,
  contact_phone,
  business_address,
  business_description,
  dti_registration_url,
  business_permit_url,
  gcash_qr_url,
  gcash_number,
  gcash_name,
  bank_name,
  bank_account_number,
  bank_account_name,
  payment_instructions
) ON TABLE public.tours_operators TO authenticated;

GRANT UPDATE (
  gcash_number,
  gcash_name,
  bank_name,
  bank_account_number,
  bank_account_name,
  payment_instructions
) ON TABLE public.tours_operators TO authenticated;

-- The server-only registration and admin-review actions use this role after
-- verifying the caller. It must retain full row writes, including review data.
GRANT SELECT, INSERT, UPDATE ON TABLE public.tours_operators TO service_role;

COMMIT;
