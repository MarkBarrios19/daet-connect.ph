import "server-only";
import type { LiveTourBoardProps } from "@/components/tours/live/live-tour-board";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Loaded = Omit<LiveTourBoardProps, "role"> & { touristId: string; status: string; tourDate: string; isGuide: boolean; isOperator: boolean; hasGuide: boolean; guideNotNeeded: boolean };

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * What the live map needs about a booking, read through RLS: the tourist,
 * the assigned guide, the operator and admins can read a booking; anyone
 * else gets null.
 */
export async function loadLiveTour(bookingId: string, viewerId: string): Promise<Loaded | null> {
  const supabase = await createSupabaseServerClient();
  const { data: booking } = await supabase
    .from("tours_bookings")
    .select(
      "id, user_id, status, tour_date, booking_reference, contact_name, contact_phone, assigned_guide_id, guide_not_needed_at, tours_packages ( id, title, meeting_point_name, meeting_lat, meeting_lng, tours_operators ( profile_id ) )",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const pkg = Array.isArray(booking.tours_packages) ? booking.tours_packages[0] : booking.tours_packages;
  const operator = pkg ? (Array.isArray(pkg.tours_operators) ? pkg.tours_operators[0] : pkg.tours_operators) : null;

  // tours_guides links to profiles twice (profile_id, reviewed_by), so the
  // embed names its foreign key; an unnamed one fails and the guide reads as null.
  const [{ data: stops }, { data: guide }, { data: participants }, { data: checkins }] = await Promise.all([
    pkg ? supabase.from("tours_package_stops").select("location_name, latitude, longitude, stop_order").eq("package_id", pkg.id).order("stop_order") : Promise.resolve({ data: [] }),
    booking.assigned_guide_id ? supabase.from("tours_guides").select("profile_id, profiles!tours_guides_profile_id_fkey ( full_name )").eq("id", booking.assigned_guide_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("tours_booking_participants").select("id").eq("booking_id", booking.id),
    supabase.from("tours_checkins").select("participant_id").eq("booking_id", booking.id),
  ]);
  const guideProfile = guide ? (Array.isArray(guide.profiles) ? guide.profiles[0] : guide.profiles) : null;
  const meetLat = num(pkg?.meeting_lat);
  const meetLng = num(pkg?.meeting_lng);
  const checked = new Set((checkins ?? []).map((c) => c.participant_id ?? "party"));

  return {
    bookingId: booking.id,
    touristId: booking.user_id,
    status: booking.status,
    tourDate: booking.tour_date,
    hasGuide: Boolean(booking.assigned_guide_id),
    guideNotNeeded: Boolean(booking.guide_not_needed_at),
    isGuide: guide?.profile_id === viewerId,
    isOperator: operator?.profile_id === viewerId,
    tourTitle: pkg?.title ?? "Tour",
    bookingReference: booking.booking_reference,
    contactName: booking.contact_name,
    contactPhone: booking.contact_phone ?? null,
    guideName: guideProfile?.full_name ?? null,
    meetingPoint: meetLat !== null && meetLng !== null ? { name: pkg?.meeting_point_name ?? "Meeting point", lat: meetLat, lng: meetLng } : null,
    stops: (stops ?? []).flatMap((s) => {
      const lat = num(s.latitude);
      const lng = num(s.longitude);
      return lat !== null && lng !== null ? [{ name: s.location_name, lat, lng }] : [];
    }),
    checkIn: { party: checked.has("party"), present: (participants ?? []).filter((p) => checked.has(p.id)).length, total: (participants ?? []).length },
  };
}
