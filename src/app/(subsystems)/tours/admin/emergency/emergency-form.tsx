"use client";

import { Notice } from "@/components/ui/notice";
import { usePromoForm } from "@/components/tours/use-promo-form";
import { PromoField, promoInputClass } from "@/components/tours/promo-fields";
import { EMERGENCY_KINDS } from "@/lib/tours/emergency/contacts";
import { addEmergencyContact } from "./actions";

export function EmergencyForm() {
  const { state, pending, onSubmit } = usePromoForm(addEmergencyContact);
  const errors = state.errors;
  const invalid = (field: string) => (errors[field] ? true : undefined);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {state.message ? <Notice variant="error">{state.message}</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <PromoField id="label" label="Name" required hint="e.g. Daet Police Station" error={errors.label}>
          <input id="label" name="label" maxLength={80} required aria-invalid={invalid("label")} className={promoInputClass} />
        </PromoField>
        <PromoField id="kind" label="Kind" required error={errors.kind}>
          <select id="kind" name="kind" defaultValue="police" aria-invalid={invalid("kind")} className={promoInputClass}>
            {Object.entries(EMERGENCY_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </PromoField>
        <PromoField id="phone" label="Phone number" required hint="As people should dial it, e.g. 0917 123 4567" error={errors.phone}>
          <input id="phone" name="phone" type="tel" inputMode="tel" maxLength={30} required aria-invalid={invalid("phone")} className={promoInputClass} />
        </PromoField>
        <PromoField id="area" label="Area (optional)" hint="e.g. Mercedes, Calaguas" error={errors.area}>
          <input id="area" name="area" maxLength={60} aria-invalid={invalid("area")} className={promoInputClass} />
        </PromoField>
      </div>
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center rounded-full bg-blue-600 px-6 font-bold text-white hover:bg-blue-700 disabled:opacity-60">
        {pending ? "Saving…" : "Add number"}
      </button>
    </form>
  );
}
