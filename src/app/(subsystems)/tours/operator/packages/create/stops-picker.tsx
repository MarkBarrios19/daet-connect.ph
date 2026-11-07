"use client";

import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { FreeMap } from "@/components/maps/free-map";
import { LocationPicker } from "@/components/maps/location-picker";
import { validCoordinates, type Attraction, type CreateStop } from "./stops";

export function CreateStopsPicker({ attractions, stops, onChange }: {
  attractions: Attraction[];
  stops: CreateStop[];
  onChange: (stops: CreateStop[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<CreateStop>>({});
  const [mapMode, setMapMode] = useState(false);
  const [error, setError] = useState("");
  const available = attractions.filter((place) => validCoordinates(place.latitude, place.longitude));
  function start(index: number | null) {
    setEditing(index);
    setDraft(index === null ? {} : { ...stops[index] });
    setMapMode(false);
    setError("");
    setOpen(true);
  }
  function save() {
    if (!draft.locationName?.trim() || !validCoordinates(draft.latitude, draft.longitude)) {
      setError("Choose an attraction or pick a point on the map and name the stop.");
      return;
    }
    const stop: CreateStop = { locationName: draft.locationName.trim(), description: draft.description?.trim() ?? "", latitude: draft.latitude as number, longitude: draft.longitude as number };
    onChange(editing === null ? [...stops, stop] : stops.map((item, index) => index === editing ? stop : item));
    setOpen(false);
  }
  const hasPoint = validCoordinates(draft.latitude, draft.longitude);
  return <section className="rounded-2xl card-edge bg-surface p-6">
    <h2 className="text-xl font-bold text-daet-ink">Route &amp; stops</h2>
    <p className="mt-1 text-sm text-daet-ink/70">Choose each stop by attraction name or pick its location on the map.</p>
    <ol className="mt-4 space-y-2">
      {stops.map((stop, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-canvas p-3">
        <div><p className="font-bold">{index + 1}. {stop.locationName}</p>{stop.description && <p className="text-sm text-daet-ink/70">{stop.description}</p>}</div>
        <div className="flex gap-2"><button type="button" className="min-h-11 px-3 font-bold" onClick={() => start(index)} aria-label={`Edit ${stop.locationName}`}>Edit</button>
          <button type="button" className="min-h-11 px-3 text-red-700 dark:text-red-300" onClick={() => onChange(stops.filter((_, i) => i !== index))} aria-label={`Remove ${stop.locationName}`}>Remove</button></div>
      </li>)}
    </ol>
    <button type="button" onClick={() => start(null)} className="mt-4 min-h-11 rounded-full border border-daet-ink/20 px-5 font-bold">Add stop</button>
    <Modal open={open} onClose={() => setOpen(false)} title={editing === null ? "Add stop" : "Edit stop"} description="You'll save everything when you submit the package."
      footer={<><button type="button" className="min-h-11 rounded-full px-5" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="min-h-11 rounded-full bg-daet-forest px-5 font-bold text-white" onClick={save}>Save stop</button></>}>
      {open && <div className="space-y-4">
        <Combobox label="Find an attraction" options={available.map((place) => ({ id: place.id, label: place.name }))}
          onQueryChange={() => { setDraft({}); setMapMode(false); }}
          onSelect={(option) => { const place = available.find((item) => item.id === option.id); if (place) { setDraft({ locationName: place.name, description: place.description ?? "", latitude: place.latitude!, longitude: place.longitude! }); setMapMode(false); setError(""); } }} />
        <button type="button" className="min-h-11 font-bold text-blue-700 dark:text-blue-300" onClick={() => { setMapMode(true); setDraft({}); }}>Not in the list? Pick on the map</button>
        {mapMode ? <><p className="text-sm text-daet-ink/70">Tap the map to set the stop, then give it a name.</p>
          <LocationPicker mapOnly latitude={draft.latitude ?? null} longitude={draft.longitude ?? null} onChange={(latitude, longitude) => { setDraft((current) => ({ ...current, latitude, longitude })); setError(""); }} />
          <Field id="picked-stop-name" label="Stop name"><Input value={draft.locationName ?? ""} onChange={(event) => setDraft({ ...draft, locationName: event.target.value })} /></Field>
        </> : hasPoint ? <FreeMap title="Stop location preview" className="h-48" controls="zoom" fitKey={`${draft.latitude},${draft.longitude}`} markers={[{ id: "stop", kind: "stop", label: "1", title: draft.locationName ?? "Stop", lat: draft.latitude!, lng: draft.longitude! }]} /> : null}
        {hasPoint && <Field id="picked-stop-description" label="Description (optional)"><Textarea rows={2} value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>}
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      </div>}
    </Modal>
  </section>;
}
