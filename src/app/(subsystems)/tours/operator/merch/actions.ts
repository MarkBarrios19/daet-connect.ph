"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { removePromoImage, uploadPromoImage } from "@/lib/tours/promo-admin";
import { parseMerchForm, readPromoImage, type PromoFormState } from "@/lib/tours/promo-validation";
import { getVerifiedSession } from "@/lib/tours/server-auth";

async function requireApprovedOperator() {
  const session = await getVerifiedSession();
  if (!session.user) return { ok: false as const, error: "Please sign in again." };
  if (session.role !== "operator") return { ok: false as const, error: "Only accredited operators can submit products." };
  const supabase = await createSupabaseServerClient();
  const { data: operator } = await supabase
    .from("tours_operators")
    .select("id, accreditation_status")
    .eq("profile_id", session.user.id)
    .maybeSingle();
  if (!operator || operator.accreditation_status !== "approved") return { ok: false as const, error: "Only accredited operators can submit products." };
  return { ok: true as const, supabase, userId: session.user.id, operatorId: operator.id };
}

function revalidateMerchPages() {
  revalidatePath("/");
  revalidatePath("/tours/merch");
  revalidatePath("/tours/admin/merch");
  revalidatePath("/tours/operator/merch");
}

/** Create or edit the operator's own product. Every save goes back to the Tourism Office for approval. */
export async function saveMyMerch(_prev: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const ctx = await requireApprovedOperator();
  if (!ctx.ok) return { message: ctx.error, errors: {} };

  const parsed = parseMerchForm(formData);
  if (!parsed.ok) return { message: "Please fix the highlighted fields.", errors: parsed.errors };
  const image = readPromoImage(formData);
  if (image.error) return { message: image.error, errors: { image: image.error } };

  const idValue = formData.get("id");
  const id = typeof idValue === "string" && idValue ? idValue : null;

  let previousImageUrl: string | null = null;
  if (id) {
    // RLS only returns the operator's own submissions.
    const { data: existing } = await ctx.supabase
      .from("tours_merchandise")
      .select("id, image_url")
      .eq("id", id)
      .eq("submitted_by_operator_id", ctx.operatorId)
      .maybeSingle();
    if (!existing) return { message: "This product no longer exists.", errors: {} };
    previousImageUrl = existing.image_url;
  }

  let imageUrl = previousImageUrl;
  if (image.file) {
    const uploaded = await uploadPromoImage(ctx.supabase, image.file, `merch-submissions/${ctx.userId}`);
    if ("error" in uploaded) return { message: uploaded.error, errors: { image: uploaded.error } };
    imageUrl = uploaded.url;
  } else if (formData.get("removeImage") === "on") {
    imageUrl = null;
  }

  const row = { ...parsed.data, is_featured: false, review_status: "pending" as const, image_url: imageUrl };
  const { error } = id
    ? await ctx.supabase.from("tours_merchandise").update(row).eq("id", id).eq("submitted_by_operator_id", ctx.operatorId)
    : await ctx.supabase.from("tours_merchandise").insert({ ...row, submitted_by_operator_id: ctx.operatorId, created_by: ctx.userId });
  if (error) {
    console.error("Operator merch save error:", error);
    if (image.file) await removePromoImage(ctx.supabase, imageUrl);
    return { message: "The product could not be saved. Please try again.", errors: {} };
  }
  if (previousImageUrl && previousImageUrl !== imageUrl) await removePromoImage(ctx.supabase, previousImageUrl);

  revalidateMerchPages();
  redirect("/tours/operator/merch?saved=1");
}

export async function deleteMyMerch(formData: FormData): Promise<void> {
  const ctx = await requireApprovedOperator();
  if (!ctx.ok) redirect("/tours/operator/merch?error=1");
  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/tours/operator/merch");
  const { data: deleted, error } = await ctx.supabase
    .from("tours_merchandise")
    .delete()
    .eq("id", id)
    .eq("submitted_by_operator_id", ctx.operatorId)
    .select("image_url")
    .maybeSingle();
  if (error || !deleted) redirect("/tours/operator/merch?error=1");
  await removePromoImage(ctx.supabase, deleted.image_url);
  revalidateMerchPages();
  redirect("/tours/operator/merch?deleted=1");
}
