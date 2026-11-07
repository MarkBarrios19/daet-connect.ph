-- Read-only verification of the final public.tours_packages policy set.
-- Run AFTER supabase/migrations/20261128_reconcile_package_policies.sql.
-- Every returned row must have ok = true. Missing, extra, renamed,
-- restrictive, widened, or differently targeted policies return false.
-- No fixtures, data changes, role changes, or migration application.
--
--   psql "$DATABASE_URL" -f supabase/tests/package_policy_catalog.sql
--
-- Also safe to paste into the Supabase SQL editor. On a project that has
-- not received the reconciliation migration, failures are expected drift
-- diagnostics, not permission to apply a migration automatically.
-- Expressions are compared without whitespace or optional public. schema
-- prefixes; casts/aliases follow the PostgreSQL 17/18 deparser. The offline
-- Node test executes this same query and checks that it detects drift.

WITH expected_raw(policy_name, definition) AS (
  VALUES
    (
      'Approved operator creates own draft packages',
      jsonb_build_object(
        'cmd', 'INSERT', 'roles', jsonb_build_array('authenticated'), 'permissive', 'PERMISSIVE',
        'using', NULL,
        'check', '((status = ''draft''::package_status) AND (operator_id IN ( SELECT o.id
          FROM tours_operators o
          WHERE ((o.profile_id = ( SELECT auth.uid() AS uid)) AND (o.accreditation_status = ''approved''::accreditation_status)))))'
      )
    ),
    (
      'Approved operator updates own draft packages',
      jsonb_build_object(
        'cmd', 'UPDATE', 'roles', jsonb_build_array('authenticated'), 'permissive', 'PERMISSIVE',
        'using', '((status = ''draft''::package_status) AND (operator_id IN ( SELECT o.id
          FROM tours_operators o
          WHERE ((o.profile_id = ( SELECT auth.uid() AS uid)) AND (o.accreditation_status = ''approved''::accreditation_status)))))',
        'check', '((status = ANY (ARRAY[''draft''::package_status, ''pending_review''::package_status])) AND (operator_id IN ( SELECT o.id
          FROM tours_operators o
          WHERE ((o.profile_id = ( SELECT auth.uid() AS uid)) AND (o.accreditation_status = ''approved''::accreditation_status)))))'
      )
    ),
    (
      'Approved operator deletes own draft packages',
      jsonb_build_object(
        'cmd', 'DELETE', 'roles', jsonb_build_array('authenticated'), 'permissive', 'PERMISSIVE',
        'using', '((status = ''draft''::package_status) AND (operator_id IN ( SELECT o.id
          FROM tours_operators o
          WHERE ((o.profile_id = ( SELECT auth.uid() AS uid)) AND (o.accreditation_status = ''approved''::accreditation_status)))))',
        'check', NULL
      )
    ),
    (
      'Operator views own packages',
      jsonb_build_object(
        'cmd', 'SELECT', 'roles', jsonb_build_array('authenticated'), 'permissive', 'PERMISSIVE',
        'using', '(operator_id IN ( SELECT o.id
          FROM tours_operators o
          WHERE (o.profile_id = ( SELECT auth.uid() AS uid))))',
        'check', NULL
      )
    ),
    (
      'Public views published packages',
      jsonb_build_object(
        'cmd', 'SELECT', 'roles', jsonb_build_array('public'), 'permissive', 'PERMISSIVE',
        'using', '(status = ''published''::package_status)', 'check', NULL
      )
    ),
    (
      'Admin manages all packages',
      jsonb_build_object(
        'cmd', 'ALL', 'roles', jsonb_build_array('authenticated'), 'permissive', 'PERMISSIVE',
        'using', '(EXISTS ( SELECT 1
          FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ''admin''::text))))',
        'check', '(EXISTS ( SELECT 1
          FROM profiles
          WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = ''admin''::text))))'
      )
    )
), expected AS (
  SELECT policy_name, jsonb_build_object(
    'cmd', definition->'cmd',
    'roles', definition->'roles',
    'permissive', definition->'permissive',
    'using', regexp_replace(replace(definition->>'using', 'public.', ''), '[[:space:]]+', '', 'g'),
    'check', regexp_replace(replace(definition->>'check', 'public.', ''), '[[:space:]]+', '', 'g')
  ) AS definition
  FROM expected_raw
), actual AS (
  SELECT
    policyname AS policy_name,
    jsonb_build_object(
      'cmd', cmd,
      'roles', (SELECT jsonb_agg(role_name ORDER BY role_name) FROM unnest(roles) AS r(role_name)),
      'permissive', permissive,
      'using', regexp_replace(replace(qual, 'public.', ''), '[[:space:]]+', '', 'g'),
      'check', regexp_replace(replace(with_check, 'public.', ''), '[[:space:]]+', '', 'g')
    ) AS definition
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'tours_packages'
), checks AS (
  SELECT
    COALESCE(e.policy_name, a.policy_name) AS check_name,
    e.definition IS NOT DISTINCT FROM a.definition AS ok,
    e.definition AS expected,
    a.definition AS actual
  FROM expected e
  FULL JOIN actual a ON a.policy_name = e.policy_name
)
SELECT * FROM checks
UNION ALL
SELECT
  'RLS enabled on public.tours_packages',
  COALESCE(relrowsecurity, false),
  'true'::jsonb,
  to_jsonb(COALESCE(relrowsecurity, false))
FROM (
  SELECT COALESCE(bool_or(c.relrowsecurity), false) AS relrowsecurity
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'tours_packages'
) table_rls
ORDER BY check_name;
