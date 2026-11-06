"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePromoAdmin } from "@/lib/tours/promo-admin";
import { isUuid } from "@/lib/tours/operator-access";
import { toManilaDateKey } from "@/lib/tours/events-calendar";
import { isEmergencyKind, validPhone } from "@/lib/tours/emergency/contacts";

const LIST = "/tours/admin/emergency";

import type { PromoFormState } from "@/lib/tours/promo-validation";
export type EmergencyFormState = PromoFormState;

const text = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/** Adds a number; it counts as checked today. */
export async function addEmergencyContact(_prev: EmergencyFormState, formData: FormData): Promise<EmergencyFormState> {
  const admin = await requirePromoAdmin();
  if (!admin.ok) return { message: admin.error, errors: {} };
  const label = text(formData, "label");
  const kind = text(formData, "kind");
  const phone = text(formData, "phone");
  const area = text(formData, "area");
  const errors: Record<string, string> = {};
  if (label.length < 2 || label.length > 80) errors.label = "Enter a name, e.g. Daet Police Station.";
  if (!isEmergencyKind(kind)) errors.kind = "Choose a kind.";
  if (!validPhone(phone)) errors.phone = "Enter a phone number: digits, spaces, +, ( ) or -.";
  if (area.length > 60) errors.area = "Keep the area under 60 characters.";
  if (Object.keys(errors).length) return { message: "Please fix the highlighted fields.", errors };

  const { error } = await admin.supabase
    .from("tours_emergency_contacts")
    .insert({ label, kind, phone, area: area || null, checked_on: toManilaDateKey(new Date()) });
  if (error) {
    console.error("Add emergency contact error:", error);
    return { message: "The number could not be saved. Please try again.", errors: {} };
  }
  revalidatePath(LIST);
  redirect(`${LIST}?saved=1`);
}

async function rowAction(formData: FormData, run: (id: string, admin: Extract<Awaited<ReturnType<typeof requirePromoAdmin>>, { ok: true }>) => PromiseLike<{ error: unknown }>, done: string) {
  const admin = await requirePromoAdmin();
  if (!admin.ok) redirect(`${LIST}?error=unauthorized`);
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect(LIST);
  const { error } = await run(id, admin);
  if (error) {
    console.error("Emergency contact action error:", error);
    redirect(`${LIST}?error=action`);
  }
  revalidatePath(LIST);
  redirect(`${LIST}?${done}=1`);
}

/** "I called it and it works": sets the checked date to today. */
export async function markEmergencyChecked(formData: FormData): Promise<void> {
  await rowAction(formData, (id, admin) => admin.supabase.from("tours_emergency_contacts").update({ checked_on: toManilaDateKey(new Date()) }).eq("id", id), "checked");
}

export async function deleteEmergencyContact(formData: FormData): Promise<void> {
  await rowAction(formData, (id, admin) => admin.supabase.from("tours_emergency_contacts").delete().eq("id", id), "deleted");
}
