-- Published tour packages remain public while operators edit them. Every
-- validated package field (photos, pricing, inclusions, stops, duration, etc.)
-- is saved live; no Tourism Office review step is introduced by an edit.
--
-- Keep the existing atomic RPC and its safeguards: owner/approval checks,
-- row locking, expected_updated_at concurrency checks, status restrictions for
-- pending_review/archived, payload validation, and the booked-price-variant
-- deletion guard. Only remove the older published-field allowlist.
--
-- Patch the latest function definition rather than restating its full body so
-- the first-stop and first-inclusion fixes from 20261121/20261126 are retained.
DO $do$
DECLARE
  v_sig regprocedure := 'public.update_package_and_relations(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, timestamp with time zone, boolean)'::regprocedure;
  v_def text := pg_get_functiondef(v_sig);
  v_start_marker text := '  IF v_status = ''published'' THEN';
  v_end_marker text := E'\n  END IF;';
  v_restriction_marker text := 'This change is not allowed on a published package';
  v_start integer;
  v_end_relative integer;
  v_block text;
  v_occurrences integer;
BEGIN
  v_occurrences :=
    (length(v_def) - length(replace(v_def, v_start_marker, ''))) / length(v_start_marker);

  IF v_occurrences = 0 THEN
    IF position(v_restriction_marker IN v_def) = 0 THEN
      RETURN; -- already patched
    END IF;
    RAISE EXCEPTION 'update_package_and_relations: published guard marker changed';
  END IF;

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'update_package_and_relations: expected one published guard, found %', v_occurrences;
  END IF;

  v_start := position(v_start_marker IN v_def);
  v_end_relative := position(v_end_marker IN substring(v_def FROM v_start));
  IF v_end_relative = 0 THEN
    RAISE EXCEPTION 'update_package_and_relations: published guard end marker not found';
  END IF;

  v_block := substring(
    v_def
    FROM v_start
    FOR v_end_relative + length(v_end_marker) - 1
  );
  IF position(v_restriction_marker IN v_block) = 0 THEN
    RAISE EXCEPTION 'update_package_and_relations: published guard did not contain the expected rejection';
  END IF;

  v_def := substring(v_def FROM 1 FOR v_start - 1)
    || '  -- Published package changes are saved live; validation and concurrency checks remain.'
    || substring(v_def FROM v_start + v_end_relative + length(v_end_marker) - 1);

  IF position(v_restriction_marker IN v_def) > 0 THEN
    RAISE EXCEPTION 'update_package_and_relations: published restriction remains after patch';
  END IF;

  EXECUTE v_def;
END
$do$;
