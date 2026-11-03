/**
 * The account photo: where it lives, and what is allowed to become one.
 *
 * The browser shrinks a photo before it is sent (`compressImageFile`), but the
 * browser is not the gate — a Server Action can be posted to directly. So the
 * bytes are checked again here: size, declared type, extension, and the file's
 * own signature, because a `.jpg` that is really an HTML page is the oldest
 * trick there is.
 *
 * Everything in this file is pure, so the plan's rules are testable without a
 * database, a bucket or a browser.
 */

/** The bucket `20261116_profile_settings.sql` creates. */
export const AVATAR_BUCKET = "tours-avatars";

/** 5 MB: what the bucket itself allows, and what the client compresses under. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** SVG is deliberately absent: it can carry script. */
export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];

/** What the file picker offers. */
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(",");

const EXTENSIONS: Record<AvatarMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForMime(mime: AvatarMime): string {
  return EXTENSIONS[mime];
}

/** Is this one of the three types we accept, in any casing or spacing? */
export function isAvatarMime(value: unknown): value is AvatarMime {
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase().trim();
  return (AVATAR_MIME_TYPES as readonly string[]).includes(normalized);
}

/**
 * The type the bytes themselves say they are, whatever the upload was called.
 *
 * JPEG starts FF D8 FF; PNG's signature is the eight bytes 89 50 4E 47 0D 0A 1A
 * 0A; WebP is a RIFF container whose form type at offset 8 is "WEBP".
 */
export function sniffImageMime(bytes: Uint8Array): AvatarMime | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

export type AvatarCheck =
  | { ok: true; mime: AvatarMime; extension: string }
  | { ok: false; error: string };

/**
 * Whether this upload may become an account photo.
 *
 * The messages are the ones a person reads, so they say what to do rather than
 * what failed: "Choose a JPG, PNG or WebP under 5 MB."
 */
export function checkAvatarUpload(input: {
  size: number;
  type?: string | null;
  bytes?: Uint8Array;
}): AvatarCheck {
  const { size, type, bytes } = input;

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "That file is empty. Choose a photo instead." };
  }
  if (size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: "That photo is larger than 5 MB. Choose a smaller one.",
    };
  }
  if (type != null && type !== "" && !isAvatarMime(type)) {
    return { ok: false, error: "Choose a JPG, PNG or WebP photo." };
  }

  const declared = isAvatarMime(type) ? type : null;
  if (!bytes) {
    // No bytes to inspect (a unit test of the size rule, say): trust the type
    // only when it is one of ours, and refuse when nothing declared a type.
    return declared
      ? { ok: true, mime: declared, extension: EXTENSIONS[declared] }
      : { ok: false, error: "Choose a JPG, PNG or WebP photo." };
  }

  const sniffed = sniffImageMime(bytes);
  if (!sniffed) {
    return { ok: false, error: "That file is not a JPG, PNG or WebP photo." };
  }
  if (declared && declared !== sniffed) {
    return {
      ok: false,
      error:
        "That file is not the kind of image it says it is. Choose another photo.",
    };
  }

  return { ok: true, mime: sniffed, extension: EXTENSIONS[sniffed] };
}

/**
 * Where a photo is stored: `tours-avatars/<user id>/avatar-<stamp>.<ext>`.
 *
 * The stamp is not decoration — a replaced photo has to appear at once, and a
 * public URL that never changes is served from the CDN's cache. The id comes
 * from the session, never from a form, and is scrubbed anyway so that nothing
 * walkable (`../`) can ever reach a key.
 */
export function avatarObjectKey(
  userId: string,
  stamp: number,
  extension: string,
): string {
  const owner = (userId ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (owner.length < 8) throw new Error("avatarObjectKey needs a real user id");
  const at = Number.isFinite(stamp) ? Math.abs(Math.trunc(stamp)) : Date.now();
  const ext = /^[a-z0-9]{2,5}$/.test(extension) ? extension : "jpg";
  return `${AVATAR_BUCKET}/${owner}/avatar-${at}.${ext}`;
}

/**
 * The object key behind one of our own public URLs, or null for anything else.
 *
 * Used to remove the photo that is being replaced; a URL that is not ours (an
 * old Gravatar link, a hand-typed address) simply yields null and is left alone.
 */
export function avatarKeyFromUrl(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string" || url === "") return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  if (path === "" || path.includes("..")) return null;
  return `${AVATAR_BUCKET}/${path}`;
}
