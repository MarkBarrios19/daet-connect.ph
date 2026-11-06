-- Chat list: show the other person's name and when they were last active.
--
-- 1. tours_presence holds one "last seen" time per user. It has no policies:
--    nobody reads or writes it directly. Users stamp themselves through
--    tours_touch_presence(), and tours_chat_inbox() returns only the
--    last-seen time of the person on the other end of each of the viewer's
--    own chats, so no one can look up an arbitrary user's status.
-- 2. tours_chat_inbox() now titles booking chats with the tourist's name for
--    the operator and guide (the package moves to the subtitle), and returns
--    the other person's id, avatar and last-seen time.

CREATE TABLE IF NOT EXISTS public.tours_presence (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tours_presence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tours_touch_presence()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO tours_presence (profile_id, last_seen_at)
  VALUES ((SELECT auth.uid()), now())
  ON CONFLICT (profile_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_touch_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_touch_presence() TO authenticated;

DROP FUNCTION IF EXISTS public.tours_chat_inbox();
CREATE FUNCTION public.tours_chat_inbox()
RETURNS TABLE (
  conversation_id uuid, kind text, title text, subtitle text, booking_id uuid,
  last_message_at timestamptz, last_message text, last_sender_id uuid, unread integer,
  other_profile_id uuid, other_avatar_url text, other_last_seen timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT q.id, q.kind, q.title, q.subtitle, q.booking_id, q.last_message_at, q.message_text, q.sender_id, q.unread,
         q.other_id, cp.avatar_url::text, pr.last_seen_at
  FROM (
    SELECT c.id, c.kind,
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN COALESCE(p.title, 'Tour booking') ELSE COALESCE(b.contact_name, 'Tourist') END
             WHEN 'guide_tourist' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Your guide') ELSE COALESCE(b.contact_name, 'Tourist') END
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN COALESCE(gp.full_name, 'Guide') ELSE o.business_name END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE COALESCE(tp.full_name, 'Tourist') END
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Daet Tourism Office' ELSE o.business_name END
           END::text AS title,
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid())
                                      THEN concat_ws(' · ', b.booking_reference, to_char(b.tour_date, 'Mon DD'), b.contact_name)
                                      ELSE concat_ws(' · ', p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD')) END
             WHEN 'guide_tourist' THEN concat_ws(' · ', CASE WHEN b.user_id = (SELECT auth.uid()) THEN 'Your guide' ELSE 'Tourist' END,
                                                 p.title, b.booking_reference, to_char(b.tour_date, 'Mon DD'))
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tour guide' ELSE 'Tour operator' END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN 'Tourism Office help' ELSE 'Tourist · help request' END
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN 'Tourism Office support' ELSE 'Operator · ' || o.accreditation_status::text END
           END::text AS subtitle,
           c.booking_id, c.last_message_at, lm.message_text, lm.sender_id,
           (SELECT count(*)::int FROM tours_messages m
             WHERE m.conversation_id = c.id AND m.sender_id <> (SELECT auth.uid())
               AND m.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)) AS unread,
           -- The person on the other end, for the avatar and the active status.
           -- The Tourism Office has no single person, so no status there.
           CASE c.kind
             WHEN 'booking' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN o.profile_id ELSE b.user_id END
             WHEN 'guide_tourist' THEN CASE WHEN b.user_id = (SELECT auth.uid()) THEN g.profile_id ELSE b.user_id END
             WHEN 'operator_guide' THEN CASE WHEN o.profile_id = (SELECT auth.uid()) THEN g.profile_id ELSE o.profile_id END
             WHEN 'tourist_office' THEN CASE WHEN c.tourist_id = (SELECT auth.uid()) THEN NULL ELSE c.tourist_id END
             ELSE CASE WHEN o.profile_id = (SELECT auth.uid()) THEN NULL ELSE o.profile_id END
           END AS other_id
    FROM tours_conversations c
    LEFT JOIN tours_bookings b ON b.id = c.booking_id
    LEFT JOIN tours_packages p ON p.id = b.package_id
    LEFT JOIN tours_operators o ON o.id = COALESCE(p.operator_id, c.operator_id)
    LEFT JOIN tours_guides g ON g.id = CASE WHEN c.booking_id IS NOT NULL THEN b.assigned_guide_id ELSE c.guide_id END
    LEFT JOIN profiles gp ON gp.id = g.profile_id
    LEFT JOIN profiles tp ON tp.id = c.tourist_id AND c.kind = 'tourist_office'
    LEFT JOIN tours_conversation_reads r ON r.conversation_id = c.id AND r.profile_id = (SELECT auth.uid())
    LEFT JOIN LATERAL (
      SELECT m.message_text, m.sender_id FROM tours_messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ) lm ON true
    WHERE public.tours_is_conversation_member(c.id)
  ) q
  LEFT JOIN profiles cp ON cp.id = q.other_id
  LEFT JOIN tours_presence pr ON pr.profile_id = q.other_id
  ORDER BY q.last_message_at DESC;
$fn$;
REVOKE EXECUTE ON FUNCTION public.tours_chat_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tours_chat_inbox() TO authenticated;
