import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  avatarKeyFromUrl,
  avatarObjectKey,
  checkAvatarUpload,
  extensionForMime,
  isAvatarMime,
  sniffImageMime,
} from "./avatar";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe("sniffImageMime", () => {
  it("knows the three by their first bytes", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
  });

  it("says nothing for anything else", () => {
    expect(sniffImageMime(PDF)).toBeNull();
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43]))).toBeNull(); // <!DOC
  });
});

describe("checkAvatarUpload", () => {
  it("accepts the three types when the bytes agree", () => {
    expect(checkAvatarUpload({ size: 1200, type: "image/jpeg", bytes: JPEG })).toEqual({
      ok: true,
      mime: "image/jpeg",
      extension: "jpg",
    });
    expect(checkAvatarUpload({ size: 1200, type: "image/png", bytes: PNG })).toMatchObject({ ok: true, extension: "png" });
    expect(checkAvatarUpload({ size: 1200, type: "image/webp", bytes: WEBP })).toMatchObject({ ok: true, extension: "webp" });
  });

  it("refuses a file that is not an image, whatever it is called", () => {
    const check = checkAvatarUpload({ size: 1200, type: "image/jpeg", bytes: PDF });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/not a JPG, PNG or WebP photo/i);
  });

  it("refuses a file whose bytes contradict its name", () => {
    const check = checkAvatarUpload({ size: 1200, type: "image/png", bytes: JPEG });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/not the kind of image it says it is/i);
  });

  it("refuses the types a photo cannot be", () => {
    expect(checkAvatarUpload({ size: 1200, type: "image/gif", bytes: JPEG }).ok).toBe(false);
    expect(checkAvatarUpload({ size: 1200, type: "image/svg+xml", bytes: JPEG }).ok).toBe(false);
    expect(checkAvatarUpload({ size: 1200, type: "application/pdf", bytes: PDF }).ok).toBe(false);
  });

  it("holds the 5 MB line and refuses emptiness", () => {
    expect(checkAvatarUpload({ size: AVATAR_MAX_BYTES, type: "image/jpeg", bytes: JPEG }).ok).toBe(true);
    const big = checkAvatarUpload({ size: AVATAR_MAX_BYTES + 1, type: "image/jpeg", bytes: JPEG });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/larger than 5 MB/i);
    expect(checkAvatarUpload({ size: 0, type: "image/jpeg", bytes: JPEG }).ok).toBe(false);
  });

  it("can judge a declared type alone when there are no bytes to read", () => {
    expect(checkAvatarUpload({ size: 1200, type: "image/webp" })).toMatchObject({ ok: true, mime: "image/webp" });
    expect(checkAvatarUpload({ size: 1200, type: "" }).ok).toBe(false);
  });
});

describe("where a photo is stored", () => {
  it("puts it in the person's own folder with a stamp", () => {
    expect(avatarObjectKey("9b7e5a5e-0000-4000-8000-000000000001", 1762300000000, "png")).toBe(
      `${AVATAR_BUCKET}/9b7e5a5e-0000-4000-8000-000000000001/avatar-1762300000000.png`,
    );
  });

  it("cannot be walked out of", () => {
    const key = avatarObjectKey("../../etc/passwd-ignored-id", 5, "jpg");
    expect(key).not.toContain("..");
    expect(key.startsWith(`${AVATAR_BUCKET}/`)).toBe(true);
    expect(key.split("/")).toHaveLength(3);
  });

  it("refuses an id that is not one", () => {
    expect(() => avatarObjectKey("u1", Date.now(), "jpg")).toThrow(/real user id/);
  });

  it("falls back to jpg for a nonsense extension", () => {
    expect(avatarObjectKey("9b7e5a5e-0000-4000-8000-000000000001", 1, "../x")).toMatch(/\.jpg$/);
  });

  it("finds the key behind one of our own public URLs, and nothing else", () => {
    const url = `https://project.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/9b7e5a5e-0000-4000-8000-000000000001/avatar-7.webp`;
    expect(avatarKeyFromUrl(url)).toBe(`${AVATAR_BUCKET}/9b7e5a5e-0000-4000-8000-000000000001/avatar-7.webp`);
    expect(avatarKeyFromUrl(`${url}?width=80`)).toBe(
      `${AVATAR_BUCKET}/9b7e5a5e-0000-4000-8000-000000000001/avatar-7.webp`,
    );
    expect(avatarKeyFromUrl("https://gravatar.com/avatar/abc")).toBeNull();
    expect(avatarKeyFromUrl("")).toBeNull();
    expect(avatarKeyFromUrl(null)).toBeNull();
    expect(avatarKeyFromUrl(`https://x/storage/v1/object/public/${AVATAR_BUCKET}/../secret`)).toBeNull();
  });

  it("names extensions and types the way the storage client wants them", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(isAvatarMime("IMAGE/PNG")).toBe(true);
    expect(isAvatarMime(null)).toBe(false);
  });
});
