"use client";

import { ShareLink } from "@/components/planner/share-link";
import { setItinerarySharing } from "../actions";

export function ShareControls({ id, title, initialToken, baseUrl }: { id: string; title: string; initialToken: string | null; baseUrl: string }) {
  return <ShareLink id={id} title={title} initialToken={initialToken} baseUrl={baseUrl} setSharing={setItinerarySharing} />;
}
