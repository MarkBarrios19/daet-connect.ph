import { EmptyState } from "@/components/ui/empty-state";
import { LineIcon } from "@/components/ui/icons";
import Link from "next/link";
import { PageFrame } from "@/components/ui/page-frame";
import { Notice } from "@/components/ui/notice";
import { MerchCard } from "@/components/tours/merch-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMerchCategory, MERCH_CATEGORIES, MERCH_COLUMNS, type MerchItem } from "@/lib/tours/promo-validation";

export const metadata = {
  title: "Daet merchandise",
  description: "T-shirts, mugs, souvenirs and pasalubong from local Daet sellers.",
};

export default async function MerchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = isMerchCategory(params.category) ? params.category : null;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tours_merchandise")
    .select(MERCH_COLUMNS)
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(120);
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  const items = (data ?? []) as MerchItem[];

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-bold transition active:scale-[0.98] ${active ? "bg-blue-600 text-white" : "bg-surface text-daet-ink hover:bg-blue-50 dark:hover:bg-blue-950/40"}`;

  return (
    <PageFrame>
      <header className="mb-6">
        <h1 className="display-2 text-daet-ink">Take Daet home</h1>
        <p className="mt-2 max-w-2xl text-lg text-daet-ink">
          T-shirts, mugs, souvenirs and pasalubong from local sellers. Contact the seller directly or visit their shop to buy.
        </p>
      </header>

      <nav aria-label="Filter by category" className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          <li>
            <Link href="/tours/merch" aria-current={category === null ? "page" : undefined} className={chipClass(category === null)}>
              All
            </Link>
          </li>
          {Object.entries(MERCH_CATEGORIES).map(([value, label]) => (
            <li key={value}>
              <Link href={`/tours/merch?category=${value}`} aria-current={category === value ? "page" : undefined} className={chipClass(category === value)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {error ? <Notice variant="error" className="mb-6">Products could not be loaded right now. Please try again later.</Notice> : null}

      {items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id} data-reveal className="flex">
              <MerchCard item={item} />
            </li>
          ))}
        </ul>
      ) : !error ? (
        <EmptyState icon={<LineIcon name="bag" />} title="No products in this category yet" description="Check back soon for new Daet souvenirs." />
      ) : null}

      <p className="mt-8 text-sm text-daet-ink/75">
        Listings are advertisements. Prices and availability are set by each seller.
      </p>
    </PageFrame>
  );
}
