-- A published legacy package with no included item cannot satisfy the edit
-- validator: the UI also forbids adding one, while the RPC rejects any change
-- to the inclusion count. Allow exactly one appended, included item only when
-- the published package currently has no included rows. Existing published
-- packages with an included row still cannot add/remove inclusions.
--
-- Patch the deployed RPC rather than restating it, preserving the published
-- gallery-review behavior and the earlier first-stop exception.
DO $do$
DECLARE
  v_sig regprocedure := 'public.update_package_and_relations(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamp with time zone, boolean)'::regprocedure;
  v_old text := 'OR jsonb_array_length(p_inclusions) <> (SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id)';
  v_new text := 'OR (jsonb_array_length(p_inclusions) <> (SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id)
           AND (
             EXISTS (SELECT 1 FROM tours_package_inclusions WHERE package_id = p_package_id AND is_included)
             OR jsonb_array_length(p_inclusions) <> ((SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id) + 1)
             OR NOT EXISTS (
               SELECT 1
               FROM jsonb_array_elements(p_inclusions) WITH ORDINALITY AS t(v, idx)
               WHERE t.idx = jsonb_array_length(p_inclusions)
                 AND t.v->>''is_included'' = ''true''
             )
           ))';
  v_marker text := 'jsonb_array_length(p_inclusions) <> ((SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id) + 1)';
  v_def text := pg_get_functiondef(v_sig);
BEGIN
  IF position(v_marker IN v_def) > 0 THEN
    RETURN; -- already patched
  END IF;
  IF (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'update_package_and_relations: inclusion-count guard not found exactly once';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;
