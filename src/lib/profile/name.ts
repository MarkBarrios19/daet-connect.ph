/**
 * The name and the letter beside it.
 *
 * Two places knew a name and they did not agree: the header read the auth
 * service's `user_metadata`, while bookings, rosters and messages read
 * `public.profiles.full_name` — which `handle_new_user()` left empty for seven
 * of the ten accounts. A profile edit now writes both, and this is the one
 * order of preference everything reads them in.
 */

/** Shown when nothing at all is known about the person. */
export const FALLBACK_NAME = "Your account";

export type NameParts = {
  /** `public.profiles.full_name` — the record. */
  profileName?: string | null;
  /** `user_metadata.full_name` or `name` — the mirror sign-up writes. */
  metaName?: string | null;
  /** The address, whose local part is the last resort. */
  email?: string | null;
};

/** A usable name, or nothing if the value is blank or not a string. */
function tidy(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean === "" ? null : clean;
}

/**
 * The best name we have: the profile, then the sign-up metadata, then the part
 * of the address before the @, then one calm sentence.
 */
export function displayName(parts: NameParts): string {
  const profile = tidy(parts.profileName);
  if (profile) return profile;

  const meta = tidy(parts.metaName);
  if (meta) return meta;

  const local = tidy(parts.email)?.split("@")[0];
  if (local) return local;

  return FALLBACK_NAME;
}

/**
 * The single letter the round avatars draw, or "?" when a name has none.
 *
 * One letter, not two: the header's circle is 40px and the phone tab's is 26px.
 * Iterating code points rather than UTF-16 units keeps a name that starts with
 * an emoji or a letter outside the BMP from turning into half a character.
 */
export function initials(name: string | null | undefined): string {
  for (const character of (name ?? "").normalize("NFC")) {
    if (/[\p{L}\p{N}]/u.test(character)) return character.toUpperCase();
  }
  return "?";
}
