/** "1 day", "3 days", "2 hours": the database may store the unit singular or plural. */
export const durationText = (value: number | null, type: string | null): string | null => {
  if (!value || !type) return null;
  const unit = type.trim().toLowerCase().replace(/s$/, "");
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
};
