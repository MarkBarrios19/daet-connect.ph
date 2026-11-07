-- ================================================================
-- Package editing goes through one checked function; loose policies go.
--
-- 20261021_fix_update_package_and_relations.sql was never applied live,
-- so the operator edit page had no function to save through, while the
-- old policy "Operators can update their own packages" let operators
-- change any of their tours directly, published ones included, without
-- Tourism Office review. This migration:
--   * adds the columns and gallery limit that migration expected;
--   * creates update_package_and_relations (status rules enforced here)
--     and concurrency_check;
--   * keeps booked price variants: rows are updated by id rather than
--     deleted and re-created, because bookings point at them;
--   * drops the loose INSERT/UPDATE policies and two duplicate SELECTs.
-- Operators keep: create/update/delete own drafts (strict policies),
-- submit_package_for_review, tours_set_meeting_point, and this function.
-- ================================================================

-- 1. Columns the editor expects ---------------------------------------
ALTER TABLE tours_package_inclusions ADD COLUMN IF NOT EXISTS display_order INTEGER;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY created_at, id) AS rn
  FROM tours_package_inclusions
  WHERE display_order IS NULL
)
UPDATE tours_package_inclusions i
SET display_order = o.rn + COALESCE(
  (SELECT MAX(display_order) FROM tours_package_inclusions x
   WHERE x.package_id = i.package_id AND x.display_order IS NOT NULL), 0)
FROM ordered o
WHERE i.id = o.id;

ALTER TABLE tours_package_inclusions ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE tours_package_stops ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;

-- 2. Gallery limit (20 per package) -----------------------------------
CREATE OR REPLACE FUNCTION enforce_package_gallery_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = NEW.package_id) >= 20 THEN
    RAISE EXCEPTION 'A package can have at most 20 gallery images' USING ERRCODE = 'PT400';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_package_gallery_limit ON tours_package_gallery;
CREATE TRIGGER trg_package_gallery_limit
  BEFORE INSERT ON tours_package_gallery
  FOR EACH ROW EXECUTE FUNCTION enforce_package_gallery_limit();

-- 3. concurrency_check -------------------------------------------------
DROP FUNCTION IF EXISTS concurrency_check(UUID, TIMESTAMPTZ);
CREATE FUNCTION concurrency_check(p_package_id UUID, p_cached_updated_at TIMESTAMPTZ)
RETURNS TABLE(has_conflict BOOLEAN, current_updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TIMESTAMPTZ;
BEGIN
  SELECT tp.updated_at INTO v_current
  FROM tours_packages tp
  JOIN tours_operators toper ON toper.id = tp.operator_id
  WHERE tp.id = p_package_id AND toper.profile_id = auth.uid();
  -- A missing (or not owned) package counts as a conflict.
  RETURN QUERY SELECT (v_current IS NULL OR v_current IS DISTINCT FROM p_cached_updated_at), v_current;
END;
$$;
REVOKE ALL ON FUNCTION concurrency_check(UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION concurrency_check(UUID, TIMESTAMPTZ) TO authenticated;

-- 4. update_package_and_relations -------------------------------------
DROP FUNCTION IF EXISTS update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS update_package_and_relations(UUID, TIMESTAMPTZ, JSONB, JSONB, JSONB, JSONB, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ, BOOLEAN);

CREATE FUNCTION update_package_and_relations(
  p_package_id UUID,
  p_package_data JSONB,
  p_price_variants JSONB,
  p_inclusions JSONB,
  p_stops JSONB,
  p_gallery JSONB,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL,
  p_submit_for_review BOOLEAN DEFAULT false
)
RETURNS TABLE(success BOOLEAN, new_updated_at TIMESTAMPTZ, new_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_duration_value NUMERIC;
  v_duration_type TEXT;
  v_result_updated_at TIMESTAMPTZ;
  v_result_status TEXT;
  v_keep UUID[];
BEGIN
  -- Ownership + row lock (serialises concurrent saves of one package)
  SELECT tp.status::TEXT, tp.updated_at, tp.duration_value, tp.duration_type::TEXT
    INTO v_status, v_current_updated_at, v_duration_value, v_duration_type
  FROM tours_packages tp
  JOIN tours_operators toper ON toper.id = tp.operator_id
  WHERE tp.id = p_package_id
    AND toper.profile_id = auth.uid()
    AND toper.accreditation_status = 'approved'
  FOR UPDATE OF tp;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package not found or access denied' USING ERRCODE = 'PT404';
  END IF;
  IF v_status IN ('pending_review', 'archived') THEN
    RAISE EXCEPTION 'Package cannot be edited while status is %', v_status USING ERRCODE = 'PT403';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Package was modified by another session' USING ERRCODE = 'PT409';
  END IF;
  IF p_submit_for_review AND v_status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected packages can be submitted for review' USING ERRCODE = 'PT403';
  END IF;

  -- Payload shape and limits (IS DISTINCT FROM so a null list is refused)
  IF jsonb_typeof(p_package_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Package details are required' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_price_variants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_price_variants) = 0 THEN
    RAISE EXCEPTION 'At least one price variant is required' USING ERRCODE = 'PT400';
  END IF;
  IF (SELECT COUNT(*) FROM jsonb_array_elements(p_price_variants) v
      WHERE COALESCE((v->>'is_default')::BOOLEAN, false)) <> 1 THEN
    RAISE EXCEPTION 'Exactly one default price variant is required' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_inclusions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_inclusions) > 50 THEN
    RAISE EXCEPTION 'A package can have at most 50 inclusion items' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_stops) IS DISTINCT FROM 'array' OR jsonb_array_length(p_stops) > 50 THEN
    RAISE EXCEPTION 'A package can have at most 50 stops' USING ERRCODE = 'PT400';
  END IF;
  IF jsonb_typeof(p_gallery) IS DISTINCT FROM 'array' OR jsonb_array_length(p_gallery) > 20 THEN
    RAISE EXCEPTION 'A package can have at most 20 gallery images' USING ERRCODE = 'PT400';
  END IF;

  -- Published packages: only wording, captions and pax ranges may change
  -- (mirrors findRestrictedChanges in the edit page).
  IF v_status = 'published' THEN
    IF (p_package_data->>'duration_value')::NUMERIC IS DISTINCT FROM v_duration_value
       OR COALESCE(p_package_data->>'duration_type', v_duration_type) IS DISTINCT FROM v_duration_type
       OR jsonb_array_length(p_price_variants) <> (SELECT COUNT(*) FROM tours_package_price_variants WHERE package_id = p_package_id)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_price_variants) v
         LEFT JOIN tours_package_price_variants pv
           ON pv.id = NULLIF(v->>'id', '')::UUID AND pv.package_id = p_package_id
         WHERE pv.id IS NULL
            OR pv.variant_name IS DISTINCT FROM trim(v->>'variant_name')
            OR pv.price_per_pax IS DISTINCT FROM NULLIF(v->>'price_per_pax', '')::NUMERIC
            OR pv.flat_price IS DISTINCT FROM NULLIF(v->>'flat_price', '')::NUMERIC
            OR pv.is_default IS DISTINCT FROM COALESCE((v->>'is_default')::BOOLEAN, false))
       OR jsonb_array_length(p_inclusions) <> (SELECT COUNT(*) FROM tours_package_inclusions WHERE package_id = p_package_id)
       OR jsonb_array_length(p_stops) <> (SELECT COUNT(*) FROM tours_package_stops WHERE package_id = p_package_id)
       OR jsonb_array_length(p_gallery) <> (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = p_package_id)
       -- Same items in the same order: included/excluded flags, stop
       -- durations and photos are fixed; only their text may change.
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_inclusions) WITH ORDINALITY AS t(v, idx)
         JOIN (SELECT is_included, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn
               FROM tours_package_inclusions WHERE package_id = p_package_id) cur
           ON cur.rn = t.idx
         WHERE cur.is_included IS DISTINCT FROM COALESCE((t.v->>'is_included')::BOOLEAN, true))
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_stops) WITH ORDINALITY AS t(v, idx)
         JOIN (SELECT estimated_duration_minutes, ROW_NUMBER() OVER (ORDER BY stop_order, id) AS rn
               FROM tours_package_stops WHERE package_id = p_package_id) cur
           ON cur.rn = t.idx
         WHERE cur.estimated_duration_minutes IS DISTINCT FROM NULLIF(t.v->>'estimated_duration_minutes', '')::INTEGER)
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS t(v, idx)
         JOIN (SELECT image_url, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn
               FROM tours_package_gallery WHERE package_id = p_package_id) cur
           ON cur.rn = t.idx
         WHERE cur.image_url IS DISTINCT FROM trim(t.v->>'image_url'))
    THEN
      RAISE EXCEPTION 'This change is not allowed on a published package' USING ERRCODE = 'PT403';
    END IF;
  END IF;

  -- Core fields (+ optional submit)
  UPDATE tours_packages tp
  SET
    title = COALESCE(NULLIF(trim(p_package_data->>'title'), ''), tp.title),
    location_name = COALESCE(NULLIF(trim(p_package_data->>'location_name'), ''), tp.location_name),
    description = NULLIF(trim(p_package_data->>'description'), ''),
    duration_value = COALESCE((p_package_data->>'duration_value')::NUMERIC, tp.duration_value),
    duration_type = COALESCE(p_package_data->>'duration_type', tp.duration_type::TEXT)::duration_type,
    cover_image_url = CASE
      WHEN p_package_data ? 'cover_image_url' THEN NULLIF(trim(p_package_data->>'cover_image_url'), '')
      ELSE tp.cover_image_url
    END,
    status = CASE WHEN p_submit_for_review THEN 'pending_review'::package_status ELSE tp.status END,
    rejection_reason = CASE WHEN p_submit_for_review THEN NULL ELSE tp.rejection_reason END,
    updated_at = now()
  WHERE tp.id = p_package_id
  RETURNING tp.updated_at, tp.status::TEXT INTO v_result_updated_at, v_result_status;

  -- Price variants: update by id, insert new, remove the rest.
  -- Bookings reference variants, so a booked variant cannot be removed.
  SELECT COALESCE(array_agg(NULLIF(v->>'id', '')::UUID), '{}') INTO v_keep
  FROM jsonb_array_elements(p_price_variants) v WHERE NULLIF(v->>'id', '') IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM tours_package_price_variants pv
    JOIN tours_bookings b ON b.price_variant_id = pv.id
    WHERE pv.package_id = p_package_id AND NOT (pv.id = ANY (v_keep))
  ) THEN
    RAISE EXCEPTION 'A price option with bookings cannot be removed' USING ERRCODE = 'PT403';
  END IF;

  -- Clear the default first so the one-default rule never trips mid-update.
  UPDATE tours_package_price_variants SET is_default = false WHERE package_id = p_package_id;
  DELETE FROM tours_package_price_variants WHERE package_id = p_package_id AND NOT (id = ANY (v_keep));

  UPDATE tours_package_price_variants pv
  SET variant_name = trim(v->>'variant_name'),
      min_pax = (v->>'min_pax')::INTEGER,
      max_pax = NULLIF(v->>'max_pax', '')::INTEGER,
      price_per_pax = NULLIF(v->>'price_per_pax', '')::NUMERIC,
      flat_price = NULLIF(v->>'flat_price', '')::NUMERIC,
      is_default = COALESCE((v->>'is_default')::BOOLEAN, false)
  FROM jsonb_array_elements(p_price_variants) v
  WHERE pv.package_id = p_package_id AND pv.id = NULLIF(v->>'id', '')::UUID;

  INSERT INTO tours_package_price_variants (
    package_id, variant_name, min_pax, max_pax, price_per_pax, flat_price, is_default
  )
  SELECT p_package_id, trim(v->>'variant_name'), (v->>'min_pax')::INTEGER,
         NULLIF(v->>'max_pax', '')::INTEGER, NULLIF(v->>'price_per_pax', '')::NUMERIC,
         NULLIF(v->>'flat_price', '')::NUMERIC, COALESCE((v->>'is_default')::BOOLEAN, false)
  FROM jsonb_array_elements(p_price_variants) v
  WHERE NULLIF(v->>'id', '') IS NULL
     OR NOT EXISTS (SELECT 1 FROM tours_package_price_variants pv
                    WHERE pv.package_id = p_package_id AND pv.id = NULLIF(v->>'id', '')::UUID);

  -- Inclusions, stops and gallery: nothing references them, so rewrite.
  DELETE FROM tours_package_inclusions WHERE package_id = p_package_id;
  INSERT INTO tours_package_inclusions (package_id, item_text, is_included, display_order)
  SELECT p_package_id, trim(t.v->>'item_text'), COALESCE((t.v->>'is_included')::BOOLEAN, true),
         ROW_NUMBER() OVER (ORDER BY (t.v->>'display_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_inclusions) WITH ORDINALITY AS t(v, idx);

  DELETE FROM tours_package_stops WHERE package_id = p_package_id;
  INSERT INTO tours_package_stops (
    package_id, location_name, description, latitude, longitude, estimated_duration_minutes, stop_order
  )
  SELECT p_package_id, trim(t.v->>'location_name'), NULLIF(trim(t.v->>'description'), ''),
         (t.v->>'latitude')::NUMERIC, (t.v->>'longitude')::NUMERIC,
         NULLIF(t.v->>'estimated_duration_minutes', '')::INTEGER,
         ROW_NUMBER() OVER (ORDER BY (t.v->>'stop_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_stops) WITH ORDINALITY AS t(v, idx);

  DELETE FROM tours_package_gallery WHERE package_id = p_package_id;
  INSERT INTO tours_package_gallery (package_id, image_url, caption, display_order)
  SELECT p_package_id, trim(t.v->>'image_url'), NULLIF(t.v->>'caption', ''),
         ROW_NUMBER() OVER (ORDER BY (t.v->>'display_order')::INTEGER NULLS LAST, t.idx)
  FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS t(v, idx);

  RETURN QUERY SELECT true, v_result_updated_at, v_result_status;
END;
$$;

REVOKE ALL ON FUNCTION update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_package_and_relations(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, TIMESTAMPTZ, BOOLEAN) TO authenticated;

-- 5. Loose and duplicate policies --------------------------------------
DROP POLICY IF EXISTS "Operators can update their own packages" ON tours_packages;
DROP POLICY IF EXISTS "Operators can insert their own packages" ON tours_packages;
DROP POLICY IF EXISTS "Operators can view their own packages" ON tours_packages;
DROP POLICY IF EXISTS "Public can view published packages" ON tours_packages;
