-- Legacy setup script kept safe to re-run. The canonical live fix is
-- 20261128_operator_accreditation_write_protection.sql.
--
-- Do not restore GRANT INSERT, UPDATE ON tours_operators to authenticated:
-- table-level privileges cover accreditation_status and reviewer metadata,
-- and override the intended effect of column-level restrictions.

REVOKE INSERT, UPDATE ON TABLE public.tours_operators FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tours_operators TO authenticated;

-- Applicants can supply business/document fields, but never accreditation,
-- reviewer, row-identity, or timestamp fields. Defaults supply the latter.
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

-- The operator settings action needs only these six payment columns.
GRANT UPDATE (
  gcash_number,
  gcash_name,
  bank_name,
  bank_account_number,
  bank_account_name,
  payment_instructions
) ON TABLE public.tours_operators TO authenticated;

-- Verified Server Actions use the service role for registration/resubmission
-- and for admin approval/rejection, including reviewer metadata.
GRANT SELECT, INSERT, UPDATE ON TABLE public.tours_operators TO service_role;

-- Review both the row policy and its check expression when auditing.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'tours_operators';
