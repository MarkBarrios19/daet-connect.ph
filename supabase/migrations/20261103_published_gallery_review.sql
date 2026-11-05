-- Published packages: gallery photos go live only after review.
--
-- Before this migration a published package accepted caption edits only; adding,
-- removing or reordering a gallery image raised "This change is not allowed on
-- a published package". Operators can now change the gallery, but a structural
-- change (add / remove / reorder) sends the package back to pending_review, so it
-- leaves the public listing until the Tourism Office approves it again.
--
-- Caption-only edits stay live without a review.
--
-- Everything else in this function is unchanged from the version applied on
-- 2026-10-23: same ownership check, same concurrency check, same price /
-- inclusion / stop guards, same write path.

CREATE OR REPLACE FUNCTION public.update_package_and_relations(
  p_package_id uuid,
  p_package_data jsonb,
  p_price_variants jsonb,
  p_inclusions jsonb,
  p_stops jsonb,
  p_gallery jsonb,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_submit_for_review boolean DEFAULT false
)
 RETURNS TABLE(success boolean, new_updated_at timestamp with time zone, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_duration_value NUMERIC;
  v_duration_type TEXT;
  v_result_updated_at TIMESTAMPTZ;
  v_result_status TEXT;
  v_keep UUID[];
  v_gallery_changed BOOLEAN := false;
  v_review_required BOOLEAN := false;
BEGIN
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

  -- Does this save add, remove or reorder gallery images? Captions are ignored:
  -- they stay editable without a review. Reordering shows up as a different
  -- image at the same position, because the write path renumbers display_order
  -- from the array.
  v_gallery_changed :=
    jsonb_array_length(p_gallery) <> (SELECT COUNT(*) FROM tours_package_gallery WHERE package_id = p_package_id)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_gallery) WITH ORDINALITY AS t(v, idx)
      JOIN (SELECT image_url, ROW_NUMBER() OVER (ORDER BY display_order, id) AS rn
            FROM tours_package_gallery WHERE package_id = p_package_id) cur
        ON cur.rn = t.idx
      WHERE cur.image_url IS DISTINCT FROM trim(t.v->>'image_url'));

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
    THEN
      RAISE EXCEPTION 'This change is not allowed on a published package' USING ERRCODE = 'PT403';
    END IF;

    -- A structural gallery change on a live package has to be reviewed again.
    IF v_gallery_changed THEN
      v_review_required := true;
    END IF;
  END IF;

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
    status = CASE
      WHEN p_submit_for_review OR v_review_required THEN 'pending_review'::package_status
      ELSE tp.status
    END,
    rejection_reason = CASE
      WHEN p_submit_for_review OR v_review_required THEN NULL
      ELSE tp.rejection_reason
    END,
    updated_at = now()
  WHERE tp.id = p_package_id
  RETURNING tp.updated_at, tp.status::TEXT INTO v_result_updated_at, v_result_status;

  SELECT COALESCE(array_agg(NULLIF(v->>'id', '')::UUID), '{}') INTO v_keep
  FROM jsonb_array_elements(p_price_variants) v WHERE NULLIF(v->>'id', '') IS NOT NULL;

  IF EXISTS (
    SELECT 1 FROM tours_package_price_variants pv
    JOIN tours_bookings b ON b.price_variant_id = pv.id
    WHERE pv.package_id = p_package_id AND NOT (pv.id = ANY (v_keep))
  ) THEN
    RAISE EXCEPTION 'A price option with bookings cannot be removed' USING ERRCODE = 'PT403';
  END IF;

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
$function$;
