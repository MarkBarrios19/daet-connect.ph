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

export type EmergencyContact = { id: string; label: string; kind: EmergencyKind; phone: string; area: string | null; checked_on: string; is_active: boolean; sort_order?: number };

export const EMERGENCY_COLUMNS = "id, label, kind, phone, area, checked_on, is_active, sort_order";
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

/** What the visitor needs, from their words (English or Filipino). */
const NEEDS: Array<[RegExp, EmergencyKind[]]> = [
  [/\b(coast ?guard|boat|bangka|sea|dagat|drown\w*|nalulunod|lunod|capsized|tumaob|island|isla)\b/, ["coast_guard", "rescue"]],
  [/\b(hospital|ospital|doctor|doktor|injured|sugatan|sick|may sakit|ambulance|ambulansya|bleeding|dumudugo)\b/, ["hospital", "rescue"]],
  [/\b(fire|sunog)\b/, ["fire"]],
  [/\b(police|pulis|robbed|nanakawan|stolen|ninakaw|theft|scam|harass\w*)\b/, ["police"]],
  [/\b(flood|baha|landslide|rescue|lost|nawawala|typhoon|bagyo)\b/, ["rescue"]],
];
const plainText = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * The most useful numbers for this question, at most `limit`: the kind they
 * need (a drowning → Coast Guard, an injury → hospitals) and the town they
 * name come first; otherwise the Tourism Office's own order.
 */
export function pickContacts(contacts: EmergencyContact[], question = "", limit = 6): EmergencyContact[] {
  const q = plainText(question);
  const kinds = NEEDS.filter(([re]) => re.test(q)).flatMap(([, k]) => k);
  const score = (c: EmergencyContact) => {
    let s = 0;
    const kindAt = kinds.indexOf(c.kind);
    if (kindAt >= 0) s += 10 - Math.min(kindAt, 5);
    if (c.area && c.area !== "Camarines Norte" && new RegExp(`\\b${plainText(c.area).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)) s += 8;
    if (/\(alt\)$/.test(c.label)) s -= 1;
    return s;
  };
  return contacts
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || (a.c.sort_order ?? 0) - (b.c.sort_order ?? 0) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
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
