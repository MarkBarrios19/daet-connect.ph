/**
 * A rough amount in the visitor's own currency next to a peso price (decision
 * 24 in docs/TRIP_PLANNER.md). The currency is guessed from the phone's
 * language region; a phone set to Philippine time shows none (most Filipino
 * phones say en-US); an unknown region falls back to US dollars. Always marked
 * "approx.": they pay in pesos.
 */

const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const BY_REGION: Record<string, string> = {
  US: "USD", GB: "GBP", AU: "AUD", NZ: "NZD", CA: "CAD", JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD", SG: "SGD",
  MY: "MYR", TH: "THB", ID: "IDR", VN: "VND", IN: "INR", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", CH: "CHF", SE: "SEK",
  NO: "NOK", DK: "DKK", IL: "ILS",
  ...Object.fromEntries(EURO.map((r) => [r, "EUR"])),
};

/** The visitor's currency, or null when it should not be shown (in the Philippines, or pesos). */
export function visitorCurrency(locale: string | undefined, timeZone: string | undefined): string | null {
  if (timeZone === "Asia/Manila") return null;
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? "")?.[1]?.toUpperCase();
  if (region === "PH") return null;
  return (region && BY_REGION[region]) || "USD";
}

/** "≈ US$16 approx.": whole units, in the visitor's own number style. */
export function approxLabel(pesos: number, rate: number, currency: string, locale?: string): string {
  const amount = pesos * rate;
  const text = new Intl.NumberFormat(locale || "en-US", { style: "currency", currency, maximumFractionDigits: amount >= 100 || currency === "JPY" || currency === "KRW" ? 0 : 2 }).format(amount);
  return `≈ ${text} approx.`;
}
