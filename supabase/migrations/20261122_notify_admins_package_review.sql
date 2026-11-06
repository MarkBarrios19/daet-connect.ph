-- Tell the Tourism Office when a package needs review. Until now only the
-- operator was notified, and only when a review ended (approved or rejected).
-- A package entering pending_review (first submission, resubmission after
-- changes, or a published package sent back because its photos changed) now
-- notifies every admin, linking to the packages page.
CREATE OR REPLACE FUNCTION public.tours_notify_package_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_operator uuid;
  v_business text;
  v_admin uuid;
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
    PERFORM tours_notify(v_operator, 'package_approved', 'Package published', format('%s is now live for tourists.', NEW.title),
      '/tours/operator/packages/' || NEW.id);
  ELSIF NEW.status::text = 'rejected' THEN
    PERFORM tours_notify(v_operator, 'package_rejected', 'Package needs changes',
      format('%s: %s', NEW.title, COALESCE(NULLIF(btrim(NEW.rejection_reason), ''), 'See the review notes.')), '/tours/operator/packages/' || NEW.id);
  END IF;
  RETURN NULL;
END;
$fn$;
