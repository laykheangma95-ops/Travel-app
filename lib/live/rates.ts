// Live exchange rates against USD and KHR.
//
// Source: open.er-api.com — the free, key-less endpoint of ExchangeRate-API.
// It updates once a day and covers 160+ currencies including KHR and VND.
//
// We rejected Frankfurter/ECB, which is the usual pick: the ECB reference set
// carries neither KHR nor VND, so it would silently break Da Nang, Ho Chi Minh
// City and the entire Khmer-riel leg — the one conversion this audience most
// needs. A source that fails our own currency is not a source we can use.
//
// The UI labels these "updated daily", never "live". Honest labelling is the
// point: we would rather say when a number is from than imply it is real-time.

import { log } from '@/lib/logger';
import { USD_TO_KHR } from '@/data/destinations';

export interface LiveRates {
  /** How many units of the destination currency one USD buys. */
  perUsd: number;
  /** How many units of the destination currency one thousand riel buys. */
  perThousandKhr: number;
  /** Riel per USD — fetched where possible, otherwise the indicative peg. */
  khrPerUsd: number;
  /** True when khrPerUsd is the hardcoded indicative peg, not a fetched rate. */
  khrIsIndicative: boolean;
  /** Provider's own update timestamp, ISO. */
  updatedAt: string | null;
  fetchedAt: string;
}

const BASE = process.env.EXCHANGE_RATE_BASE_URL ?? 'https://open.er-api.com/v6/latest/USD';

/** Six hours. The provider only refreshes daily, so anything shorter is waste. */
export const RATES_REVALIDATE_SECONDS = 21600;

export async function getRates(currencyCode: string): Promise<LiveRates | null> {
  try {
    const res = await fetch(BASE, {
      next: { revalidate: RATES_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      log.warn('rates: provider returned non-ok', { status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      result?: string;
      time_last_update_utc?: string;
      rates?: Record<string, number>;
    };
    const perUsd = json.rates?.[currencyCode];
    if (json.result !== 'success' || typeof perUsd !== 'number') return null;

    const fetchedKhr = json.rates?.KHR;
    const khrIsIndicative = typeof fetchedKhr !== 'number' || fetchedKhr <= 0;
    const khrPerUsd = khrIsIndicative ? USD_TO_KHR : (fetchedKhr as number);

    return {
      perUsd,
      perThousandKhr: (perUsd / khrPerUsd) * 1000,
      khrPerUsd,
      khrIsIndicative,
      updatedAt: json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString() : null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    log.warn('rates: fetch failed', { err: String(err) });
    return null;
  }
}

/**
 * Format a rate for display without pretending to precision we do not have.
 * A yen rate needs no decimals; a Singapore dollar rate needs three.
 */
export function formatRate(value: number): string {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}
