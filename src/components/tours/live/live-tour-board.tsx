"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FreeMap } from "@/components/maps/free-map";
import type { FreeMapLine, FreeMapMarker } from "@/components/maps/map-types";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineIcon } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { formatDistance, haversineMeters, type LatLng } from "@/lib/maps/geo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { userFacingDbError } from "@/lib/tours/db-errors";
import { awaySince, driftAlert, formatClock, initials, isStale, lastSeenLabel, type Fix } from "@/lib/tours/live-tracking";
import { LOCATION_STATUS_TEXT, useLiveLocation } from "./use-live-location";
import { useLiveBooking, type LivePosition } from "./use-live-booking";

export type LiveStop = LatLng & { name: string };

export type LiveTourBoardProps = {
  bookingId: string;
  /** The guide runs the tour; the operator watches (and may end it). */
  role: "guide" | "operator";
  tourTitle: string;
  bookingReference: string;
  contactName: string;
  contactPhone: string | null;
  guideName: string | null;
  meetingPoint: LiveStop | null;
  stops: LiveStop[];
  checkIn: { party: boolean; present: number; total: number };
};

function touristMarker(p: LivePosition, name: string, now: number): FreeMapMarker {
  const first = name.split(/\s+/)[0] || "Guest";
  if (p.precision === "town") {
    return { id: "tourist", lat: p.lat, lng: p.lng, kind: "town", label: initials(name), title: `${first}: near ${p.place_name ?? "a town on the way"}, ${lastSeenLabel(p.updated_at, now)}` };
  }
  const stale = isStale(p.updated_at, now);
  return { id: "tourist", lat: p.lat, lng: p.lng, kind: stale ? "paused" : "guest", label: initials(name), title: `${first}: ${stale ? `last seen ${lastSeenLabel(p.updated_at, now)}` : "live"}` };
}

/**
 * The live map for one tour, for its guide or its operator. Guide: start the
 * tour (shares their location while the page is open), mark stops reached,
 * see the tourist if they share, handle "I'm separated", end the tour.
 */
export function LiveTourBoard(props: LiveTourBoardProps) {
  const { bookingId, role, contactName } = props;
  const live = useLiveBooking(bookingId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const away = useRef<number | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const isLive = Boolean(live.session && !live.session.ended_at);
  const opens = live.window ? new Date(live.window.opens).getTime() : null;
  const closes = live.window ? new Date(live.window.closes).getTime() : null;
  const guidePos = live.positions.find((p) => p.role === "guide") ?? null;
  const touristPos = live.positions.find((p) => p.role === "tourist") ?? null;
  const consent = live.consents[0] ?? null;
  const reached = live.session?.stops_reached ?? 0;

  // The guide's own phone, while the tour is live.
  const sendGuideFix = async (fix: Fix) => {
    const { data, error } = await supabase.rpc("tours_live_ping", { p_booking_id: bookingId, p_lat: fix.lat, p_lng: fix.lng, p_accuracy_m: fix.accuracy ?? undefined });
    const result = data as { stored?: boolean; reason?: string } | null;
    return !error && (result?.stored === true || result?.reason === "throttled");
  };
  const location = useLiveLocation(role === "guide" && isLive, sendGuideFix);

  // Away-from-group: tourist sharing live, both positions fresh.
  const distance = guidePos && touristPos && touristPos.precision === "exact" && !isStale(touristPos.updated_at, now) ? haversineMeters(guidePos, touristPos) : null;
  away.current = awaySince(away.current, distance, now);
  const drifting = driftAlert(away.current, now);

  const run = async (key: string, fn: () => PromiseLike<{ error: { code?: string; message?: string } | null }>, fallback: string) => {
    setBusy(key);
    setActionError(null);
    const { error } = await fn();
    setBusy(null);
    if (error) setActionError(userFacingDbError(error, fallback));
    live.refresh();
    return !error;
  };

  const markers = useMemo<FreeMapMarker[]>(() => {
    const list: FreeMapMarker[] = [];
    if (props.meetingPoint) list.push({ id: "meet", kind: "place", label: "", title: `Meeting point: ${props.meetingPoint.name}`, lat: props.meetingPoint.lat, lng: props.meetingPoint.lng });
    props.stops.forEach((s, i) => list.push({ id: `stop-${i}`, kind: "stop", label: String(i + 1), title: `Stop ${i + 1}: ${s.name}`, lat: s.lat, lng: s.lng }));
    if (touristPos) list.push(touristMarker(touristPos, contactName, now));
    if (guidePos) list.push({ id: "guide", kind: "guide", label: role === "guide" ? "You" : "G", title: `${role === "guide" ? "You" : props.guideName ?? "Guide"}: ${lastSeenLabel(guidePos.updated_at, now)}`, lat: guidePos.lat, lng: guidePos.lng });
    live.flares.forEach((f) => list.push({ id: `flare-${f.id}`, kind: "flare", label: "!", title: `${contactName} is separated (sent ${formatClock(f.created_at)})`, lat: f.lat, lng: f.lng }));
    return list;
  }, [props.meetingPoint, props.stops, props.guideName, touristPos, guidePos, live.flares, contactName, role, now]);

  const lines = useMemo<FreeMapLine[]>(() => (props.stops.length > 1 ? [{ id: "route", path: props.stops, dashed: true }] : []), [props.stops]);

  const status: { tone: BadgeTone; text: string } = isLive
    ? { tone: "danger", text: "Live" }
    : live.session?.ended_at
      ? { tone: "neutral", text: `Ended ${formatClock(live.session.ended_at)}` }
      : { tone: "neutral", text: opens ? `Live from ${formatClock(opens)}` : "Not started" };

  const touristLine = !consent || (!consent.share_tour && !consent.share_trip)
    ? "Not sharing their location."
    : touristPos
      ? touristPos.precision === "town"
        ? `Sharing their trip: near ${touristPos.place_name ?? "a town on the way"} (${lastSeenLabel(touristPos.updated_at, now)}).`
        : isStale(touristPos.updated_at, now)
          ? `Paused: last seen ${lastSeenLabel(touristPos.updated_at, now)}. Their phone may be locked.`
          : `Sharing live${distance !== null ? `, ${formatDistance(distance)} from ${role === "guide" ? "you" : "the guide"}` : ""}.`
      : consent.share_tour
        ? isLive ? "Agreed to share during the tour; waiting for their phone." : "Will share once the tour starts."
        : "Will share the town they're in on the way.";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-2 text-daet-ink">Live map</h1>
          <p className="mt-1 text-sm text-daet-ink/70">
            {props.tourTitle} · {props.bookingReference}
          </p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {isLive ? <span className="h-2 w-2 rounded-full bg-red-50 motion-safe:animate-pulse" /> : null}
          {status.text}
        </Badge>
      </div>

      {live.error ? <Notice variant="warning">{live.error}</Notice> : null}
      {actionError ? <Notice variant="error">{actionError}</Notice> : null}

      {live.flares.map((f) => (
        <div key={f.id} role="alert" className="rounded-2xl bg-red-50 p-4 text-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="flex items-center gap-2 font-bold">
            <LineIcon name="warning" className="h-5 w-5" /> {contactName} tapped “I'm separated” at {formatClock(f.created_at)}
          </p>
          <p className="mt-1 text-sm">Their location at that moment is the red pin{f.accuracy_m ? ` (within about ${f.accuracy_m} m)` : ""}. Call them or walk to it.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {props.contactPhone ? (
              <a href={`tel:${props.contactPhone}`} className="inline-flex min-h-11 items-center rounded-full bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700">
                Call {props.contactPhone}
              </a>
            ) : null}
            <Button variant="ghost" disabled={busy === f.id} onClick={() => run(f.id, () => supabase.rpc("tours_live_resolve_flare", { p_flare_id: f.id }), "Couldn't close the alert.")}>
              Mark as found
            </Button>
          </div>
        </div>
      ))}
      {drifting && distance !== null ? (
        <div role="status" className="rounded-2xl bg-yellow-50 p-4 text-yellow-950 dark:bg-yellow-950/40 dark:text-yellow-100">
          <p className="font-bold">{contactName} is away from the group</p>
          <p className="mt-1 text-sm">About {formatDistance(distance)} from {role === "guide" ? "you" : "the guide"} for 2 minutes or more.</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          {markers.length ? (
            <FreeMap markers={markers} lines={lines} title={`Live map for ${props.tourTitle}`} fitKey={`${isLive}-${touristPos?.precision ?? "none"}-${live.flares.length}`} className="h-80 sm:h-[28rem]" />
          ) : (
            <p className="rounded-2xl card-edge bg-surface p-5 text-sm text-daet-ink/70">The map appears once the guide starts the live tour.</p>
          )}
          {role === "guide" && isLive ? (
            <p className={`rounded-2xl p-3 text-sm ${location.status === "denied" || location.status === "unavailable" ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200" : "card-edge bg-surface text-daet-ink"}`}>
              {LOCATION_STATUS_TEXT[location.status]}
              {location.fix?.accuracy && location.status === "on" ? ` Accurate to about ${location.fix.accuracy} m.` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl card-edge bg-surface p-4">
            <h2 className="font-bold text-daet-ink">Guest</h2>
            <p className="mt-2 font-bold text-daet-ink">{contactName}</p>
            <p className="text-sm text-daet-ink/75">{touristLine}</p>
            <p className="mt-2 text-sm text-daet-ink/75">
              {props.checkIn.party ? "Group checked in." : props.checkIn.total ? `${props.checkIn.present} of ${props.checkIn.total} guests checked in.` : "Not checked in yet."}
            </p>
            {props.contactPhone ? (
              <a href={`tel:${props.contactPhone}`} className="mt-2 inline-block text-sm font-bold text-blue-700 underline dark:text-blue-300">
                {props.contactPhone}
              </a>
            ) : null}
          </section>

          {props.stops.length ? (
            <section className="rounded-2xl card-edge bg-surface p-4">
              <h2 className="font-bold text-daet-ink">Stops</h2>
              <ol className="mt-2 space-y-1">
                {props.stops.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-center gap-3 py-1 text-sm">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${i < reached ? "bg-green-500 text-slate-950 dark:bg-green-500/20 dark:text-green-300" : i === reached && isLive ? "bg-blue-600 text-white" : "bg-muted-strong text-daet-ink"}`}>
                      {i < reached ? <LineIcon name="check" className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={i < reached ? "text-daet-ink/70" : "font-semibold text-daet-ink"}>{s.name}</span>
                  </li>
                ))}
              </ol>
              {role === "guide" && isLive && reached < props.stops.length ? (
                <Button
                  variant="secondary"
                  fullWidth
                  className="mt-3"
                  disabled={busy === "stop"}
                  onClick={() => run("stop", () => supabase.rpc("tours_live_reach_stop", { p_booking_id: bookingId, p_stops_reached: reached + 1 }), "Couldn't update the stop.")}
                >
                  Arrived at stop {reached + 1}
                </Button>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl card-edge bg-surface p-4">
            {isLive ? (
              confirmEnd ? (
                <div>
                  <p className="text-sm font-bold text-daet-ink">End the tour? Sharing stops for everyone and their locations are deleted.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="danger" disabled={busy === "end"} onClick={async () => (await run("end", () => supabase.rpc("tours_live_end", { p_booking_id: bookingId }), "Couldn't end the tour.")) && setConfirmEnd(false)}>
                      End tour
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                      Keep going
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="danger" fullWidth onClick={() => setConfirmEnd(true)}>
                  {role === "guide" ? "End tour and stop sharing" : "End live sharing"}
                </Button>
              )
            ) : role === "guide" ? (
              closes && now >= closes ? (
                <p className="text-sm text-daet-ink/75">This tour has ended. Locations are deleted.</p>
              ) : (
                <div>
                  <Button
                    fullWidth
                    disabled={busy === "start" || (opens !== null && now < opens)}
                    onClick={() => run("start", () => supabase.rpc("tours_live_start", { p_booking_id: bookingId }), "Couldn't start the live tour.")}
                  >
                    Start live tour
                  </Button>
                  <p className="mt-2 text-sm text-daet-ink/70">
                    {opens && now < opens ? `Opens at ${formatClock(opens)}, 30 minutes before the meeting time.` : "Your location is shared with the guest and operator while this page is open."}
                  </p>
                </div>
              )
            ) : (
              <p className="text-sm text-daet-ink/75">{live.session?.ended_at ? "This tour's live sharing has ended." : `${props.guideName ?? "The guide"} hasn't started the live tour yet.`}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
