-- A published package with no stops could not get its first ones: the guard in
-- update_package_and_relations refused any change in the stop count. Allow it
-- only while the stored stop count is 0; once a published package has stops,
-- adding and removing them stays locked.
--
-- Patches the function as it is deployed (rather than restating it) so the
-- gallery-review behaviour from 20261103_published_gallery_review.sql is kept.
-- Note: 20261113_package_edit_and_policies.sql defines an older variant of this
-- function that refuses photo changes; do not re-apply it over this one.
DO $do$
DECLARE
  v_sig regprocedure := 'public.update_package_and_relations(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamp with time zone, boolean)'::regprocedure;
  v_old text := 'OR jsonb_array_length(p_stops) <> (SELECT COUNT(*) FROM tours_package_stops WHERE package_id = p_package_id)';
  v_new text := 'OR (jsonb_array_length(p_stops) <> (SELECT COUNT(*) FROM tours_package_stops WHERE package_id = p_package_id)
           AND EXISTS (SELECT 1 FROM tours_package_stops WHERE package_id = p_package_id))';
  v_def text := pg_get_functiondef(v_sig);
BEGIN
  IF position('AND EXISTS (SELECT 1 FROM tours_package_stops WHERE package_id = p_package_id))' IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'update_package_and_relations: stop-count guard not found exactly once';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;
