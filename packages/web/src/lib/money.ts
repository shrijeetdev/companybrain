// Money formatting in the organization's currency (OrgSettings.currency, ISO 4217).
import { useCallback } from 'react';
import { useOrg } from '../api/queries';

/** Common choices first; the org's current code is always offered too. */
export const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY', 'CHF', 'CNY', 'HKD', 'NZD', 'SAR', 'ZAR', 'BRL', 'MXN'] as const;

const cache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, compact
        ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
        : { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0 });
    }
    cache.set(key, f);
  }
  return f;
}

export function formatMoney(n: number, currency = 'USD', compact = true): string {
  return formatter(currency, compact).format(n);
}

/** "Indian Rupee" for "INR" (falls back to the code). */
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The currency symbol as the browser renders it, e.g. "₹" for INR. */
export function currencySymbol(code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

/** Formatter bound to the org currency. */
export function useMoney(): { currency: string; money: (n: number, compact?: boolean) => string } {
  const { data } = useOrg();
  const currency = data?.currency ?? 'USD';
  const money = useCallback((n: number, compact = true) => formatMoney(n, currency, compact), [currency]);
  return { currency, money };
}
