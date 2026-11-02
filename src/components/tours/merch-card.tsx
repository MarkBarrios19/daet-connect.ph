import { LineIcon, type IconName } from "@/components/ui/icons";
import { formatPeso, MERCH_CATEGORIES, type MerchItem } from "@/lib/tours/promo-validation";

/** Line drawing shown when a product has no photo yet. */
const MERCH_ICONS: Record<MerchItem["category"], IconName> = {
  tshirt: "bag",
  mug: "plate",
  souvenir: "gift",
  accessory: "bag",
  pasalubong: "gift",
  other: "bag",
};


/** Turns a phone number or URL into a tappable link; anything else stays plain text. */
function contactHref(contact: string): string | null {
  if (/^https?:\/\//i.test(contact)) return contact;
  const digits = contact.replace(/[\s()-]/g, "");
  if (/^\+?\d{7,15}$/.test(digits)) return `tel:${digits}`;
  return null;
}

export function MerchCard({ item }: { item: MerchItem }) {
  const price = formatPeso(item.price);
  const href = item.contact_info ? contactHref(item.contact_info) : null;

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl card-edge bg-surface">
      <div className="relative aspect-[4/3] overflow-hidden bg-blue-50 dark:bg-blue-950/40 min-[420px]:aspect-square">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-blue-600 dark:text-blue-300" aria-hidden="true">
            <LineIcon name={MERCH_ICONS[item.category]} className="h-16 w-16" />
          </div>
        )}
        {item.is_featured ? (
          <span className="absolute left-3 top-3 rounded-full bg-yellow-500 px-3 py-1 text-xs font-bold text-slate-950">Featured</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{MERCH_CATEGORIES[item.category]}</p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold text-daet-ink">{item.name}</h3>
        <p className="mt-1 text-lg font-bold text-daet-ink">{price ?? "Ask seller"}</p>
        {item.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-daet-ink/80">{item.description}</p> : null}
        <div className="mt-3 space-y-1 text-sm text-daet-ink/80">
          <p className="flex items-center gap-1.5"><LineIcon name="store" className="h-4 w-4" /> {item.seller_name}</p>
          {item.where_to_buy ? <p className="flex items-center gap-1.5"><LineIcon name="pin" className="h-4 w-4" /> {item.where_to_buy}</p> : null}
        </div>
        {item.contact_info ? (
          <div className="mt-auto pt-4">
            {href ? (
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Contact seller
              </a>
            ) : (
              <p className="flex items-center gap-1.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-sm text-daet-ink"><LineIcon name="phone" className="h-4 w-4" /> {item.contact_info}</p>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
