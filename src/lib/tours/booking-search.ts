/** Literal case-insensitive substring pattern for Postgres LIKE. */
export function bookingSearchPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Quote a value for PostgREST's logical-filter grammar. */
function quoteFilterValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function bookingSearchFilter(search: string, packageIds: string[]) {
  const pattern = quoteFilterValue(bookingSearchPattern(search));
  const filters = ["booking_reference", "contact_name", "contact_phone"].map(
    (field) => `${field}.ilike.${pattern}`,
  );
  // Package IDs come from the database, not from the search string.
  if (packageIds.length) filters.push(`package_id.in.(${packageIds.join(",")})`);
  return filters.join(",");
}
