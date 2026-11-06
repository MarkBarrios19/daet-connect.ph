import type { SupabaseClient } from "@supabase/supabase-js";

/** Emergency numbers kept by the Tourism Office (decisions 22 and 32). */
export const EMERGENCY_KINDS = {
  police: "Police",
  rescue: "Rescue (MDRRMO)",
  hospital: "Hospital",
  coast_guard: "Coast Guard",
  fire: "Fire",
  tourism: "Tourism Office",
  other: "Other",
} as const;
export type EmergencyKind = keyof typeof EMERGENCY_KINDS;

export type EmergencyContact = { id: string; label: string; kind: EmergencyKind; phone: string; area: string | null; checked_on: string; is_active: boolean };

export const EMERGENCY_COLUMNS = "id, label, kind, phone, area, checked_on, is_active";
/** The national emergency hotline: works anywhere in the Philippines. */
export const NATIONAL_HOTLINE = "911";

export const isEmergencyKind = (v: unknown): v is EmergencyKind => typeof v === "string" && v in EMERGENCY_KINDS;
export const validPhone = (v: string) => /^[0-9+() -]{3,30}$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 3;

export async function loadEmergencyContacts(supabase: Pick<SupabaseClient, "from">): Promise<EmergencyContact[]> {
  try {
    const { data, error } = await supabase.from("tours_emergency_contacts").select(EMERGENCY_COLUMNS).eq("is_active", true).order("sort_order").order("label");
    if (error) throw error;
    return (data ?? []) as EmergencyContact[];
  } catch (error) {
    console.error("Emergency contacts error:", error instanceof Error ? error.message : error);
    return [];
  }
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The assistant's answer: 911 first, then the listed numbers with their checked date, then the operator. */
export function emergencyAnswer(contacts: EmergencyContact[]): string {
  const listed = contacts.slice(0, 6).map((c) => `${c.label}: ${c.phone}`).join("; ");
  const oldest = contacts.length ? contacts.reduce((a, c) => (c.checked_on < a ? c.checked_on : a), contacts[0].checked_on) : null;
  return [
    `In an emergency, call ${NATIONAL_HOTLINE} (national emergency hotline).`,
    listed ? `In Daet: ${listed}. Numbers checked by the Tourism Office${oldest ? ` (last ${shortDate(oldest)})` : ""}.` : "",
    "On a tour, tell your guide or operator right away.",
  ]
    .filter(Boolean)
    .join(" ");
}
