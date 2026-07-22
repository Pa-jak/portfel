import type { Currency } from "./api";
import { currencyDecimals } from "./money";

/** Format a money minor value compactly for charts (major units, 1 decimal). */
export function formatCompact(minor: number, currency: Currency): string {
  const exponent = Math.pow(10, currencyDecimals(currency));
  const major = minor / exponent;
  const abs = Math.abs(major);
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(major / 1_000).toFixed(1)}k`;
  return major.toFixed(0);
}

/** Format a YYYY-MM month as a localized Polish short date (e.g. "sty 2024"). */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map((x) => Number(x));
  if (!y || !m) return month;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("pl-PL", { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** Convert a Date to YYYY-MM. */
export function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, m, 1));
  return toYearMonth(d);
}

export function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, m - 2, 1));
  return toYearMonth(d);
}