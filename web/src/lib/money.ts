// Parse user input to integer minor units and format minor units per currency.
// Money is ALWAYS handled as integer minor units end-to-end.

import type { Currency } from "./api";

export const CURRENCIES: Currency[] = ["PLN", "USD", "EUR", "NOK"];
export const BASE_CURRENCIES: Currency[] = ["PLN", "USD"];

const LOCALE: Record<Currency, string> = {
  PLN: "pl-PL",
  USD: "en-US",
  EUR: "de-DE",
  NOK: "nb-NO",
};

const SYMBOL: Record<Currency, string> = {
  PLN: "zł",
  USD: "$",
  EUR: "€",
  NOK: "kr",
};

/** Locale-sensitive currency symbol (e.g. "zł", "$", "€", "kr"). */
export function currencySymbol(c: Currency): string {
  return SYMBOL[c];
}

/**
 * Parse a user-typed money string into integer minor units.
 * Accepts both decimal (1.234,56) and dot decimal (1234.56) common in PL.
 * Returns null when the input is empty/invalid.
 */
export function parseMoneyToMinor(input: string, currency: Currency): number | null {
  const s = input.trim().replace(/\s/g, "");
  if (s === "" || s === "-" || s === "+" ) return null;

  let normalized = s;
  // If both separators present, the last one is the decimal separator.
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // comma decimal: drop dots, replace comma with dot
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // dot decimal: drop commas
      normalized = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // only commas → treat comma as decimal separator
    normalized = s.replace(",", ".");
  }

  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const decimals = currencyDecimals(currency);
  const exponent = Math.pow(10, decimals);
  // Round to nearest minor unit to absorb float error.
  const minor = Math.round(value * exponent);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

/** Format integer minor units as a localized, currency-aware display string with symbol. */
export function formatMinor(minor: number, currency: Currency, withSymbol = true): string {
  const decimals = currencyDecimals(currency);
  const exponent = Math.pow(10, decimals);
  const major = minor / exponent;
  const locale = LOCALE[currency];
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major);
  if (!withSymbol) return formatted;
  // PLN: symbol after value with nbsp; others: symbol before.
  if (currency === "PLN") return `${formatted} ${SYMBOL[currency]}`;
  if (currency === "USD") return `${SYMBOL[currency]}${formatted}`;
  return `${formatted} ${SYMBOL[currency]}`;
}

/** Convert minor units to a plain user-editable decimal string (e.g. "1234.56"). */
export function minorToInputString(minor: number, currency: Currency): string {
  const decimals = currencyDecimals(currency);
  const exponent = Math.pow(10, decimals);
  const major = minor / exponent;
  return major.toFixed(decimals);
}

/** Number of decimal (minor) units for a currency. */
export function currencyDecimals(currency: Currency): number {
  switch (currency) {
    case "PLN":
    case "USD":
    case "EUR":
    case "NOK":
      return 2;
    default:
      return 2;
  }
}