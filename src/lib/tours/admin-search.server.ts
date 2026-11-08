import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchTerm } from "@/components/ui/search-term";
import { ATTRACTION_CATEGORIES } from "@/lib/tours/attractions";
import { EVENT_CATEGORIES, MERCH_CATEGORIES, MERCH_REVIEW_LABELS } from "@/lib/tours/promo-validation";
import { FARE_MODES } from "@/lib/tours/guide/fares";
import { GUIDE_PLACE_KINDS } from "@/lib/tours/guide/places";
import { GUIDE_TABLE } from "@/lib/tours/guide-contract";
import { OPERATOR_TABLE } from "@/lib/tours/operator-contract";
import { ADMIN_SEARCH_TYPES, type AdminSearchStatus, type AdminSearchType } from "@/lib/tours/admin-search";

const LIMIT_PER_TYPE = 12;

type SearchKind = Exclude<AdminSearchType, "all">;
export type AdminSearchResult = {
  id: string;
  kind: SearchKind;
  kindLabel: string;
  title: string;
  detail: string;
  status: string;
  href: string;
};

type SearchBatch = { results: AdminSearchResult[]; hasError: boolean };

const labels = Object.fromEntries(ADMIN_SEARCH_TYPES.map(({ value, label }) => [value, label])) as Record<AdminSearchType, string>;
const empty = (): SearchBatch => ({ results: [], hasError: false });

function batch<T>(data: T[] | null, error: unknown, map: (row: T) => AdminSearchResult): SearchBatch {
  return error ? { results: [], hasError: true } : { results: (data ?? []).map(map), hasError: false };
}

function allowed(kind: SearchKind, status: AdminSearchStatus): boolean {
  if (status === "all") return true;
  const supported: Record<SearchKind, AdminSearchStatus[]> = {
    operators: ["pending"],
    guides: ["pending"],
    attractions: ["active", "hidden", "verified", "unverified"],
    events: ["published", "draft"],
    places: ["active", "hidden", "verified", "unverified"],
    fares: ["active", "hidden", "verified", "unverified"],
    packages: ["pending", "published", "draft", "archived"],
    merchandise: ["pending", "approved", "rejected", "active", "hidden"],
    reviews: ["hidden", "visible"],
  };
  return supported[kind].includes(status);
}

function statusLabel(status: unknown): string {
  const value = typeof status === "string" ? status : "";
  if (value === "pending_review" || value === "pending") return "Pending review";
  if (value === "published" || value === "approved") return value[0].toUpperCase() + value.slice(1);
  if (value === "draft" || value === "archived" || value === "rejected") return value[0].toUpperCase() + value.slice(1);
  return value || "Unknown status";
}

function hrefWithSearch(path: string, term: string): string {
  return `${path}?q=${encodeURIComponent(term)}`;
}

async function searchAttractions(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("attractions", status)) return empty();
  let query = db
    .from("tours_attractions")
    .select("id,name,slug,category,municipality,is_active,location_verified")
    .or(`name.ilike.%${term}%,slug.ilike.%${term}%,municipality.ilike.%${term}%,address.ilike.%${term}%`)
    .order("name")
    .limit(LIMIT_PER_TYPE);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "hidden") query = query.eq("is_active", false);
  if (status === "verified") query = query.eq("location_verified", true);
  if (status === "unverified") query = query.eq("location_verified", false);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "attractions",
    kindLabel: labels.attractions,
    title: row.name,
    detail: `${ATTRACTION_CATEGORIES[row.category as keyof typeof ATTRACTION_CATEGORIES] ?? row.category} · ${row.municipality}`,
    status: `${row.is_active ? "Active" : "Hidden"} · ${row.location_verified ? "Pin verified" : "Pin unverified"}`,
    href: `/tours/admin/attractions/${row.id}/edit`,
  }));
}

async function searchEvents(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("events", status)) return empty();
  let query = db
    .from("tours_events")
    .select("id,title,category,venue,starts_at,is_published")
    .or(`title.ilike.%${term}%,venue.ilike.%${term}%,organizer.ilike.%${term}%`)
    .order("starts_at", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (status === "published") query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "events",
    kindLabel: labels.events,
    title: row.title,
    detail: `${EVENT_CATEGORIES[row.category as keyof typeof EVENT_CATEGORIES] ?? row.category} · ${row.venue}`,
    status: row.is_published ? "Published" : "Draft",
    href: `/tours/admin/events/${row.id}/edit`,
  }));
}

async function searchPlaces(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("places", status)) return empty();
  let query = db
    .from("tours_guide_places")
    .select("id,name,kind,municipality,is_active,verified")
    .or(`name.ilike.%${term}%,slug.ilike.%${term}%,municipality.ilike.%${term}%,address.ilike.%${term}%,phone.ilike.%${term}%`)
    .order("name")
    .limit(LIMIT_PER_TYPE);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "hidden") query = query.eq("is_active", false);
  if (status === "verified") query = query.eq("verified", true);
  if (status === "unverified") query = query.eq("verified", false);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "places",
    kindLabel: labels.places,
    title: row.name,
    detail: `${GUIDE_PLACE_KINDS[row.kind as keyof typeof GUIDE_PLACE_KINDS] ?? row.kind} · ${row.municipality}`,
    status: `${row.is_active ? "Active" : "Hidden"} · ${row.verified ? "Verified" : "Needs verification"}`,
    href: `/tours/admin/guide-places/${row.id}/edit`,
  }));
}

async function searchFares(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("fares", status)) return empty();
  let query = db
    .from("tours_fares")
    .select("id,mode,from_name,to_name,is_active,verified")
    .or(`from_name.ilike.%${term}%,to_name.ilike.%${term}%,source.ilike.%${term}%`)
    .order("from_name")
    .limit(LIMIT_PER_TYPE);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "hidden") query = query.eq("is_active", false);
  if (status === "verified") query = query.eq("verified", true);
  if (status === "unverified") query = query.eq("verified", false);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "fares",
    kindLabel: labels.fares,
    title: `${row.from_name} to ${row.to_name}`,
    detail: FARE_MODES[row.mode as keyof typeof FARE_MODES] ?? row.mode,
    status: `${row.is_active ? "Active" : "Hidden"} · ${row.verified ? "Verified" : "Needs verification"}`,
    href: `/tours/admin/fares/${row.id}/edit`,
  }));
}

async function searchPackages(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("packages", status)) return empty();
  let query = db
    .from("tours_packages")
    .select("id,title,status,created_at")
    .ilike("title", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (status === "pending") query = query.in("status", ["pending", "pending_review"]);
  if (status === "published" || status === "draft" || status === "archived") query = query.eq("status", status);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "packages",
    kindLabel: labels.packages,
    title: row.title,
    detail: "Tour package",
    status: statusLabel(row.status),
    href: `/tours/admin/packages/${row.id}`,
  }));
}

async function searchMerchandise(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("merchandise", status)) return empty();
  let query = db
    .from("tours_merchandise")
    .select("id,name,category,seller_name,review_status,is_active,submitted_by_operator_id")
    .or(`name.ilike.%${term}%,seller_name.ilike.%${term}%,where_to_buy.ilike.%${term}%,contact_info.ilike.%${term}%`)
    .order("created_at", { ascending: false })
    .limit(LIMIT_PER_TYPE);
  if (["pending", "approved", "rejected"].includes(status)) query = query.eq("review_status", status);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "hidden") query = query.eq("is_active", false);
  const { data, error } = await query;
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "merchandise",
    kindLabel: labels.merchandise,
    title: row.name,
    detail: `${MERCH_CATEGORIES[row.category as keyof typeof MERCH_CATEGORIES] ?? row.category} · ${row.seller_name}`,
    status: `${row.submitted_by_operator_id ? MERCH_REVIEW_LABELS[row.review_status as keyof typeof MERCH_REVIEW_LABELS] : "Listed"} · ${row.is_active ? "Visible" : "Hidden"}`,
    href: `/tours/admin/merch/${row.id}/edit`,
  }));
}

function reviewStatus(query: any, status: AdminSearchStatus) {
  if (status === "hidden") return query.eq("is_hidden", true);
  if (status === "visible") return query.eq("is_hidden", false);
  return query;
}

async function searchReviews(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("reviews", status)) return empty();
  const select = "id,rating,comment,created_at,is_hidden,package_id,tours_packages(title),tours_operators(business_name)";
  const byCommentQuery = reviewStatus(
    db.from("tours_reviews").select(select).ilike("comment", `%${term}%`).order("created_at", { ascending: false }).limit(LIMIT_PER_TYPE),
    status,
  );
  const [byComment, matchingPackages, matchingOperators] = await Promise.all([
    byCommentQuery,
    db.from("tours_packages").select("id").ilike("title", `%${term}%`).limit(LIMIT_PER_TYPE),
    db.from("tours_operators").select("id").ilike("business_name", `%${term}%`).limit(LIMIT_PER_TYPE),
  ]);
  let hasError = Boolean(byComment.error || matchingPackages.error || matchingOperators.error);
  const packageIds = new Set<string>((matchingPackages.data ?? []).map((row) => row.id));
  const operatorIds = (matchingOperators.data ?? []).map((row) => row.id);
  if (operatorIds.length) {
    const { data, error } = await db.from("tours_packages").select("id").in("operator_id", operatorIds).limit(LIMIT_PER_TYPE);
    hasError ||= Boolean(error);
    (data ?? []).forEach((row) => packageIds.add(row.id));
  }
  let relatedReviews: any[] = [];
  if (packageIds.size) {
    let relatedQuery = db.from("tours_reviews").select(select).in("package_id", [...packageIds]).order("created_at", { ascending: false }).limit(LIMIT_PER_TYPE);
    relatedQuery = reviewStatus(relatedQuery, status);
    const { data, error } = await relatedQuery;
    hasError ||= Boolean(error);
    relatedReviews = data ?? [];
  }
  const records = new Map<string, any>();
  [...(byComment.data ?? []), ...relatedReviews].forEach((row) => records.set(row.id, row));
  const results = [...records.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, LIMIT_PER_TYPE)
    .map((row) => {
      const pkg = Array.isArray(row.tours_packages) ? row.tours_packages[0] : row.tours_packages;
      const operator = Array.isArray(row.tours_operators) ? row.tours_operators[0] : row.tours_operators;
      const excerpt = (row.comment ?? "Rating only").replace(/\s+/g, " ").slice(0, 120);
      return {
        id: row.id,
        kind: "reviews" as const,
        kindLabel: labels.reviews,
        title: pkg?.title ?? "Tour review",
        detail: `${operator?.business_name ?? "Operator"} · ${row.rating} star${row.rating === 1 ? "" : "s"} · ${excerpt}`,
        status: row.is_hidden ? "Hidden" : "Visible",
        href: `/tours/admin/reviews?review=${encodeURIComponent(row.id)}`,
      };
    });
  return { results, hasError };
}

async function searchOperators(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("operators", status)) return empty();
  const { data, error } = await db
    .from(OPERATOR_TABLE)
    .select("id,business_name,contact_person,contact_email,contact_phone,business_address,accreditation_status,created_at")
    .eq("accreditation_status", "pending")
    .or(`business_name.ilike.%${term}%,contact_person.ilike.%${term}%,contact_email.ilike.%${term}%,contact_phone.ilike.%${term}%,business_address.ilike.%${term}%`)
    .order("created_at", { ascending: true })
    .limit(LIMIT_PER_TYPE);
  return batch(data, error, (row) => ({
    id: row.id,
    kind: "operators",
    kindLabel: labels.operators,
    title: row.business_name,
    detail: `${row.contact_person} · ${row.contact_email}`,
    status: "Pending review",
    href: hrefWithSearch("/tours/admin/operators", term),
  }));
}

async function searchGuides(db: SupabaseClient, term: string, status: AdminSearchStatus): Promise<SearchBatch> {
  if (!allowed("guides", status)) return empty();
  const [profilesByName, guidesByDetails] = await Promise.all([
    db.from("profiles").select("id,full_name").ilike("full_name", `%${term}%`).limit(100),
    db.from(GUIDE_TABLE)
      .select("id,profile_id,contact_phone,bio,accreditation_status,created_at")
      .eq("accreditation_status", "pending")
      .or(`contact_phone.ilike.%${term}%,bio.ilike.%${term}%`)
      .order("created_at", { ascending: true })
      .limit(LIMIT_PER_TYPE),
  ]);
  let hasError = Boolean(profilesByName.error || guidesByDetails.error);
  const nameRows = profilesByName.data ?? [];
  const nameIds = nameRows.map((profile) => profile.id);
  let guidesByName: any[] = [];
  if (nameIds.length) {
    const { data, error } = await db.from(GUIDE_TABLE)
      .select("id,profile_id,contact_phone,bio,accreditation_status,created_at")
      .eq("accreditation_status", "pending")
      .in("profile_id", nameIds)
      .order("created_at", { ascending: true })
      .limit(LIMIT_PER_TYPE);
    hasError ||= Boolean(error);
    guidesByName = data ?? [];
  }
  const guides = new Map<string, any>();
  [...(guidesByDetails.data ?? []), ...guidesByName].forEach((guide) => guides.set(guide.id, guide));
  const profileIds = [...new Set([...guides.values()].map((guide) => guide.profile_id))];
  const names = new Map<string, string>(nameRows.map((profile) => [profile.id, profile.full_name ?? "Name unavailable"]));
  const missingNames = profileIds.filter((id) => !names.has(id));
  if (missingNames.length) {
    const { data, error } = await db.from("profiles").select("id,full_name").in("id", missingNames);
    hasError ||= Boolean(error);
    (data ?? []).forEach((profile) => names.set(profile.id, profile.full_name ?? "Name unavailable"));
  }
  return {
    results: [...guides.values()].slice(0, LIMIT_PER_TYPE).map((guide) => ({
      id: guide.id,
      kind: "guides",
      kindLabel: labels.guides,
      title: names.get(guide.profile_id) ?? "Guide applicant",
      detail: guide.contact_phone,
      status: "Pending review",
      href: hrefWithSearch("/tours/admin/guides", term),
    })),
    hasError,
  };
}

export async function searchAdminRecords({
  supabase,
  applicationSupabase = supabase,
  term: rawTerm,
  type,
  status,
}: {
  supabase: SupabaseClient;
  /** The service client is used only after the page has verified the admin role. */
  applicationSupabase?: SupabaseClient;
  term: unknown;
  type: AdminSearchType;
  status: AdminSearchStatus;
}): Promise<{ results: AdminSearchResult[]; hasError: boolean }> {
  const term = searchTerm(rawTerm);
  if (term.length < 2) return { results: [], hasError: false };
  const sources: Array<() => Promise<SearchBatch>> = [];
  const include = (kind: SearchKind) => type === "all" || type === kind;
  if (include("operators")) sources.push(() => searchOperators(applicationSupabase, term, status));
  if (include("guides")) sources.push(() => searchGuides(supabase, term, status));
  if (include("attractions")) sources.push(() => searchAttractions(supabase, term, status));
  if (include("events")) sources.push(() => searchEvents(supabase, term, status));
  if (include("places")) sources.push(() => searchPlaces(supabase, term, status));
  if (include("fares")) sources.push(() => searchFares(supabase, term, status));
  if (include("packages")) sources.push(() => searchPackages(supabase, term, status));
  if (include("merchandise")) sources.push(() => searchMerchandise(supabase, term, status));
  if (include("reviews")) sources.push(() => searchReviews(supabase, term, status));
  const batches = await Promise.all(sources.map((search) => search()));
  return {
    results: batches.flatMap((result) => result.results),
    hasError: batches.some((result) => result.hasError),
  };
}
