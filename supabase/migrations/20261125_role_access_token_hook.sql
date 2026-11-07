-- Carry the account role inside the access token (claim "app_role"), so the
-- app can pick the header's tabs without a get_my_role() round trip per request.
--
-- This only defines the function and its grants. It does nothing until the
-- owner enables it in the dashboard (Authentication > Hooks > Customize Access
-- Token (JWT) Claims > Postgres function > public.custom_access_token_hook).
-- The app works with or without it (see src/lib/tours/server-auth.ts).
--
-- Trust model: the claim is a convenience for DISPLAY. It is as old as the
-- token (up to the JWT expiry) and is never used to authorise anything; RLS and
-- every server-side check keep calling get_my_role(), which reads profiles.role.
--
-- Same rule as get_my_role(): the role is profiles.role, and a user with no
-- profile row (or a NULL role) is a 'tourist'. It is lower-cased and trimmed
-- like normalizeRole() in the app. Roles seen today: tourist, operator, guide, admin.
--
-- The hook must never block a sign-in: any failure reading the role returns the
-- event untouched, and the app then falls back to get_my_role().
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claims jsonb;
  v_role text;
BEGIN
  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);

  BEGIN
    SELECT p.role INTO v_role
    FROM public.profiles p
    WHERE p.id = (event ->> 'user_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN event;
  END;

  v_claims := jsonb_set(
    v_claims,
    '{app_role}',
    to_jsonb(COALESCE(NULLIF(lower(btrim(v_role)), ''), 'tourist'))
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Only Supabase Auth may run the hook; it is not an API endpoint.
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
