"use client";

import { useActionState, useState } from "react";
import { LocationPicker } from "@/components/maps/location-picker";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PromoField, promoInputClass } from "@/components/tours/promo-fields";
import { saveMeetingPoint, type MeetingState } from "./meeting-actions";

export function MeetingPointForm({
  packageId,
  name,
  latitude,
  longitude,
  time,
}: {
  packageId: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  time: string | null;
}) {
  const [spot, setSpot] = useState<{ lat: number | null; lng: number | null }>({ lat: latitude, lng: longitude });
  const [state, action, pending] = useActionState<MeetingState, FormData>(saveMeetingPoint, { message: null, ok: false, errors: {} });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="packageId" value={packageId} />
      {state.message ? <Notice variant={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <p className="text-slate-600 dark:text-slate-400">Guests see this on the tour page and in their ticket, with a Google Maps button. Search a place or tap the map to set it. Leave it empty to use the first stop.</p>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <PromoField id="meeting-name" label="Meeting point" error={state.errors.name}>
          <input id="meeting-name" name="name" defaultValue={name ?? ""} maxLength={120} className={promoInputClass} placeholder="Daet plaza, in front of the church" />
        </PromoField>
        <PromoField id="meeting-time" label="Meet at" error={state.errors.time}>
          <input id="meeting-time" name="time" type="time" defaultValue={time?.slice(0, 5) ?? ""} className={promoInputClass} />
        </PromoField>
      </div>
      <LocationPicker latitude={spot.lat} longitude={spot.lng} onChange={(lat, lng) => setSpot({ lat, lng })} />
      <details className="rounded-2xl border border-daet-ink/15 px-3 py-2">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-daet-ink/80">Enter coordinates yourself</summary>
        <div className="grid gap-4 pb-2 sm:grid-cols-2">
          <PromoField id="meeting-lat" label="Latitude" error={state.errors.latitude}>
            <input
              id="meeting-lat"
              name="latitude"
              inputMode="decimal"
              value={spot.lat ?? ""}
              onChange={(e) => setSpot((c) => ({ ...c, lat: e.target.value === "" ? null : Number(e.target.value) }))}
              className={promoInputClass}
              placeholder="14.1131"
            />
          </PromoField>
          <PromoField id="meeting-lng" label="Longitude">
            <input
              id="meeting-lng"
              name="longitude"
              inputMode="decimal"
              value={spot.lng ?? ""}
              onChange={(e) => setSpot((c) => ({ ...c, lng: e.target.value === "" ? null : Number(e.target.value) }))}
              className={promoInputClass}
              placeholder="122.9545"
            />
          </PromoField>
        </div>
      </details>
      <Button type="submit" loading={pending} loadingText="Saving…">
        Save meeting point
      </Button>
    </form>
  );
}
