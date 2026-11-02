"use client";

import { useEffect, useMemo, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapMarker } from "@/components/maps/map-types";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { formatDistance, haversineMeters } from "@/lib/maps/geo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { formatClock, isStale, lastSeenLabel, pingMessage, type Fix } from "@/lib/tours/live-tracking";
import type { LiveStop } from "./live-tour-board";
import { LOCATION_STATUS_TEXT, useLiveLocation } from "./use-live-location";
import { useLiveBooking } from "./use-live-booking";

type Props = {
  bookingId: string;
  operatorName: string | null;
  operatorPhone: string | null;
  meetingPoint: LiveStop | null;
};

function Toggle({ id, checked, disabled, onChange, label, help }: { id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-canvas p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-600" />
      <span>
        <span className="block font-bold text-daet-ink">{label}</span>
        <span className="block text-sm text-daet-ink/75">{help}</span>
      </span>
    </label>
  );
}

/**
 * On the tourist's booking page around the tour date: choose what to share
 * (town only on the way, live during the tour), see where the guide is, and
 * send "I'm separated" (one location, even without sharing).
 */
export function LiveShareCard({ bookingId, operatorName, operatorPhone, meetingPoint }: Props) {
  const live = useLiveBooking(bookingId);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flareState, setFlareState] = useState<"idle" | "locating" | "sent" | "failed">("idle");

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const consent = live.consents[0] ?? null;
  // The switch moves at once; the saved choice replaces it when it arrives.
  const [pending, setPending] = useState<{ trip: boolean; tour: boolean } | null>(null);
  useEffect(() => setPending(null), [consent?.updated_at]);
  const shareTrip = pending?.trip ?? consent?.share_trip ?? false;
  const shareTour = pending?.tour ?? consent?.share_tour ?? false;
  const isLive = Boolean(live.session && !live.session.ended_at);
  const win = live.window;
  const opens = win ? new Date(win.opens).getTime() : null;
  const closes = win ? new Date(win.closes).getTime() : null;
  const tripOpens = win ? new Date(win.trip_opens).getTime() : null;
  const over = closes !== null && now >= closes;
  const duringTour = opens !== null && closes !== null && now >= opens && now < closes;
  const tripWindow = tripOpens !== null && closes !== null && now >= tripOpens && now < closes;
  const guidePos = live.positions.find((p) => p.role === "guide") ?? null;
  const myPos = live.positions.find((p) => p.role === "tourist") ?? null;

  const sending = (isLive && shareTour) || (!isLive && shareTrip && tripWindow);
  const send = async (fix: Fix) => {
    const { data, error: rpcError } = await supabase.rpc("tours_live_ping", { p_booking_id: bookingId, p_lat: fix.lat, p_lng: fix.lng, p_accuracy_m: fix.accuracy ?? undefined });
    const result = data as { stored?: boolean; reason?: string } | null;
    setNotice(rpcError ? "Your location couldn't be sent. It will try again." : pingMessage(result?.reason));
    return !rpcError && (result?.stored === true || result?.reason === "throttled");
  };
  const location = useLiveLocation(sending, send);

  const setConsent = async (trip: boolean, tour: boolean) => {
    setSaving(true);
    setError(null);
    setPending({ trip, tour });
    const { error: rpcError } = await supabase.rpc("tours_live_set_consent", { p_booking_id: bookingId, p_share_trip: trip, p_share_tour: tour });
    setSaving(false);
    if (rpcError) {
      setPending(null);
      setError(userFacingDbError(rpcError, "Couldn't save your choice. Please try again."));
    }
    live.refresh();
  };

  const sendFlare = () => {
    if (!navigator.geolocation) {
      setFlareState("failed");
      return;
    }
    setFlareState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error: rpcError } = await supabase.rpc("tours_live_flare", { p_booking_id: bookingId, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude, p_accuracy_m: Math.round(pos.coords.accuracy) });
        if (rpcError) {
          setError(userFacingDbError(rpcError, "Couldn't send. Call your operator instead."));
          setFlareState("failed");
        } else {
          setFlareState("sent");
        }
        live.refresh();
      },
      () => setFlareState("failed"),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  };
  const openFlare = live.flares[0] ?? null;

  const markers = useMemo<FreeMapMarker[]>(() => {
    const list: FreeMapMarker[] = [];
    if (meetingPoint) list.push({ id: "meet", kind: "place", label: "", title: `Meeting point: ${meetingPoint.name}`, lat: meetingPoint.lat, lng: meetingPoint.lng });
    if (guidePos) list.push({ id: "guide", kind: isStale(guidePos.updated_at, now) ? "paused" : "guide", label: "G", title: `Your guide, ${lastSeenLabel(guidePos.updated_at, now)}`, lat: guidePos.lat, lng: guidePos.lng });
    if (myPos && myPos.precision === "exact") list.push({ id: "me", kind: "guest", label: "You", title: "You", lat: myPos.lat, lng: myPos.lng });
    return list;
  }, [meetingPoint, guidePos, myPos, now]);

  if (live.loading || !win) return null;
  if (over && !isLive) return null;

  const guideLine = guidePos
    ? `${isStale(guidePos.updated_at, now) ? `Last seen ${lastSeenLabel(guidePos.updated_at, now)}` : "Live now"}${location.fix && !isStale(guidePos.updated_at, now) ? `, ${formatDistance(haversineMeters(location.fix, guidePos))} from you` : ""}.`
    : isLive
      ? "Your guide is live; their location will appear in a moment."
      : opens
        ? `Your guide's location appears from ${formatClock(opens)}, 30 minutes before the meeting time.`
        : "Your guide's location appears when the tour starts.";

  return (
    <section aria-labelledby="live-title" className="mb-6 rounded-2xl card-edge bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="live-title" className="text-xl font-bold text-daet-ink">
          Find your guide
        </h2>
        {isLive ? <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">Tour live</span> : null}
      </div>

      {error ? (
        <Notice variant="error" className="mt-3">
          {error}
        </Notice>
      ) : null}

      <p className="mt-2 flex items-start gap-2 text-daet-ink">
        <LineIcon name="guide" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
        <span>{guideLine}</span>
      </p>
      {markers.length ? (
        <div className="mt-3">
          <FreeMap markers={markers} title="Map with your guide and the meeting point" fitKey={`${Boolean(guidePos)}-${Boolean(myPos)}`} className="h-64 sm:h-80" />
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-daet-ink/80">What you share. Only your guide and {operatorName ?? "the operator"} see it, and it's deleted when the tour ends.</p>
        <Toggle
          id="share-trip"
          checked={shareTrip}
          disabled={saving}
          onChange={(v) => setConsent(v, shareTour)}
          label="Share my trip to Daet, town only"
          help={`The nearest town and when you'll arrive, never your exact spot. From ${tripOpens ? new Date(tripOpens).toLocaleString("en-PH", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }) : "a day before"} until the tour starts.`}
        />
        <Toggle
          id="share-tour"
          checked={shareTour}
          disabled={saving}
          onChange={(v) => setConsent(shareTrip, v)}
          label="Share my location during the tour"
          help="So your guide can find you. Keep this page open; a locked phone pauses sharing."
        />
        {sending ? (
          <p className={`rounded-2xl p-3 text-sm ${location.status === "denied" || location.status === "unavailable" ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200"}`}>
            {notice ?? LOCATION_STATUS_TEXT[location.status]}
            {!notice && myPos?.precision === "town" && myPos.place_name ? ` Your guide sees: near ${myPos.place_name}.` : ""}
          </p>
        ) : shareTrip && !tripWindow && !isLive ? (
          <p className="text-sm text-daet-ink/70">Trip sharing starts a day before your tour.</p>
        ) : null}
      </div>

      {duringTour ? (
        <div className="mt-5">
          {openFlare || flareState === "sent" ? (
            <div role="status" className="rounded-2xl bg-red-50 p-4 text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-bold">Your guide was told</p>
              <p className="mt-1 text-sm">We sent your guide and {operatorName ?? "the operator"} your location once. Stay where you are if it's safe; they will contact you.</p>
              {operatorPhone ? <p className="mt-2 text-sm font-bold">Operator: {operatorPhone}</p> : null}
            </div>
          ) : (
            <>
              <Button variant="danger" onClick={sendFlare} disabled={flareState === "locating"}>
                <LineIcon name="warning" className="h-4 w-4" /> {flareState === "locating" ? "Finding your location…" : "I'm separated from my group"}
              </Button>
              <p className="mt-2 text-sm text-daet-ink/70">Sends your location once to your guide and the operator, even if sharing is off.</p>
              {flareState === "failed" ? (
                <p className="mt-2 text-sm font-bold text-red-700 dark:text-red-300">
                  Couldn't get your location.{operatorPhone ? ` Call ${operatorPhone}.` : " Message your guide or operator."}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
