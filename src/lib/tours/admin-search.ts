export const ADMIN_SEARCH_TYPES = [
  { value: "all", label: "All records" },
  { value: "operators", label: "Operator applications" },
  { value: "guides", label: "Guide applications" },
  { value: "attractions", label: "Attractions" },
  { value: "events", label: "Events" },
  { value: "places", label: "Local guide places" },
  { value: "fares", label: "Fares and travel times" },
  { value: "packages", label: "Tour packages" },
  { value: "merchandise", label: "Merchandise" },
  { value: "reviews", label: "Reviews" },
] as const;

export type AdminSearchType = (typeof ADMIN_SEARCH_TYPES)[number]["value"];

export const ADMIN_SEARCH_STATUSES = [
  { value: "all", label: "Any status" },
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
  { value: "active", label: "Active / visible" },
  { value: "hidden", label: "Hidden" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Needs verification" },
  { value: "visible", label: "Visible review" },
] as const;

export type AdminSearchStatus = (typeof ADMIN_SEARCH_STATUSES)[number]["value"];

export function parseAdminSearchType(raw: unknown): AdminSearchType {
  return ADMIN_SEARCH_TYPES.some((item) => item.value === raw) ? (raw as AdminSearchType) : "all";
}

export function parseAdminSearchStatus(raw: unknown): AdminSearchStatus {
  return ADMIN_SEARCH_STATUSES.some((item) => item.value === raw) ? (raw as AdminSearchStatus) : "all";
}
