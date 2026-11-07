import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getVerifiedSession } from "@/lib/tours/server-auth";

export const PROMO_IMAGES_BUCKET = "tours-promo-images";

type AdminContext =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; error: string };

/** Re-checks the admin role server-side; RLS enforces the same rule in the database. */
export async function requirePromoAdmin(): Promise<AdminContext> {
  const session = await getVerifiedSession();
  if (!session.user) return { ok: false, error: "Please sign in with a Tourism Office admin account." };
  if (session.error) return { ok: false, error: session.error };
  if (session.role !== "admin") return { ok: false, error: "Only Tourism Office admins can manage this content." };

  const supabase = await createSupabaseServerClient();
  return { ok: true, supabase, userId: session.user.id };
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadPromoImage(
  supabase: SupabaseClient,
  file: File,
  folder: "events" | "merch" | "attractions" | `merch-submissions/${string}`,
): Promise<{ url: string } | { error: string }> {
  const path = `${folder}/${crypto.randomUUID()}.${EXTENSIONS[file.type] ?? "jpg"}`;
  const { error } = await supabase.storage.from(PROMO_IMAGES_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    console.error("Promo image upload error:", error);
    return { error: "The image could not be uploaded. Please try again." };
  }

  return { url: supabase.storage.from(PROMO_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl };
}

/** Storage path for a public URL in the promo bucket, or null for any other URL. */
export function promoImagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PROMO_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

/** Best-effort cleanup; a leftover file never blocks the database change. */
export async function removePromoImage(supabase: SupabaseClient, url: string | null): Promise<void> {
  const path = promoImagePathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(PROMO_IMAGES_BUCKET).remove([path]);
  if (error) console.error("Promo image delete error:", error);
}
