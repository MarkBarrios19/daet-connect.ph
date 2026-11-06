-- When an admin approves an edit to a package that was already live, tell the
-- operator their changes are approved instead of repeating "Package published".
-- A package counts as previously live if the operator already received a
-- "Package published" notice for it.
CREATE OR REPLACE FUNCTION public.tours_notify_package_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_operator uuid;
  v_business text;
  v_admin uuid;
  v_link text := '/tours/operator/packages/' || NEW.id;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  SELECT profile_id, business_name INTO v_operator, v_business FROM tours_operators WHERE id = NEW.operator_id;

  IF NEW.status::text = 'pending_review' THEN
    FOR v_admin IN SELECT id FROM profiles WHERE role = 'admin' LOOP
      PERFORM tours_notify(v_admin, 'package_submitted', 'Package awaiting review',
        format('%s: %s', COALESCE(v_business, 'An operator'), NEW.title), '/tours/admin/packages');
    END LOOP;
    RETURN NULL;
  END IF;

  IF OLD.status::text <> 'pending_review' THEN
    RETURN NULL;
  END IF;
  IF NEW.status::text = 'published' THEN
    IF EXISTS (SELECT 1 FROM tours_notifications WHERE profile_id = v_operator AND type = 'package_approved' AND link = v_link) THEN
      PERFORM tours_notify(v_operator, 'package_approved', 'Your changes were approved',
        format('%s: your edits are approved and live.', NEW.title), v_link);
    ELSE
      PERFORM tours_notify(v_operator, 'package_approved', 'Package published', format('%s is now live for tourists.', NEW.title), v_link);
    END IF;
  ELSIF NEW.status::text = 'rejected' THEN
    PERFORM tours_notify(v_operator, 'package_rejected', 'Package needs changes',
      format('%s: %s', NEW.title, COALESCE(NULLIF(btrim(NEW.rejection_reason), ''), 'See the review notes.')), v_link);
  END IF;
  RETURN NULL;
END;
$fn$;
