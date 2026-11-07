-- Rollback for migrations/20261125_role_access_token_hook.sql.
-- NOT in migrations/ on purpose: it must never run as part of a normal apply.
--
-- Order matters: first switch the hook OFF in the dashboard (Authentication >
-- Hooks > Customize Access Token (JWT) Claims > disable). Dropping the function
-- while the hook is still enabled makes every sign-in and token refresh fail.
-- Tokens already issued keep their app_role claim until they expire; the app
-- only uses it for display and falls back to get_my_role() when it is absent.
DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);
