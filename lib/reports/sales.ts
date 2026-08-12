// ─────────────────────────────────────────────────────────────────────────────
// Sales report aggregation.
//
// Turns raw orders into the lines of a sales statement: gross sales, discounts,
// net sales, cost of goods sold, gross profit and margin — grouped by week,
// by month, or as a single all-time total.
//
// TWO RULES GOVERN THIS FILE.
//
// 1. Money is integer cents everywhere in here. Postgres hands us DECIMAL as a
//    JavaScript number, so the very first thing we do is convert to cents and
//    round once. Adding 0.1 + 0.2 in floating point 3,000 times is how a report
//    ends up two cents away from the bank statement and nobody can explain why.
//
// 2. Unknown cost is not zero cost. Orders placed before cost_usd existed have
//    no supplier cost recorded. Treating those as free would report a 100%
//    margin on them. They are counted, reported separately as
//    `ordersMissingCost`, and excluded from COGS and margin entirely — so the
//    margin you read is the margin over orders that can actually support the
//    claim.
//
// NOTE ON WHAT IS *NOT* HERE: no customer name, email or phone. A financial
// statement does not need the contact dataset, and docs/LOCKED.md names a
// spreadsheet export of it as the exact leak path to avoid. Revenue is
// aggregate; contact data is per-person. They do not belong in one file.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/lib/supabase';
import { ApiError } from '@/lib/http';
import { log } from '@/lib/logger';
import { logSupabaseError } from '@/lib/supabaseError';
import type { OrderStatus } from '@/types';

export type ReportPeriod = 'weekly' | 'monthly' | 'all';

/** Statuses that represent money we actually took. */
const SETTLED: OrderStatus[] = ['paid', 'fulfilled'];

/** A single row of the statement — one week, one month, or the all-time total. */
export interface SalesPeriodRow {
  /** Sort/display key: '2026-W33', '2026-08', or 'All time'. */
  periodKey: string;
  /** Human label for the spreadsheet: 'Week 33 (11–17 Aug 2026)'. */
  periodLabel: string;
  periodStart: string;
  periodEnd: string;

  orders: number;
  unitsSold: number;

  grossSalesCents: number;
  discountsCents: number;
  netSalesCents: number;

  /** COGS over orders with a known cost only. */
  cogsCents: number;
  grossProfitCents: number;
  /** Basis points (1500 = 15.00%). Null when no order in the period has a cost. */
  marginBps: number | null;

  refunds: number;
  refundsCents: number;

  /** Orders in this period with no cost recorded, so excluded from COGS/margin. */
  ordersMissingCost: number;
  /** Net sales of the orders that DO have a cost — the denominator behind marginBps. */
  costedNetSalesCents: number;
}

export interface SalesReport {
  period: ReportPeriod;
  generatedAt: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  rows: SalesPeriodRow[];
  total: SalesPeriodRow;
  /** True when any row excluded orders from margin — the workbook footnotes it. */
  hasIncompleteCost: boolean;
}

/** Row shape we read. Contact columns are deliberately not selected. */
interface OrderRow {
  status: OrderStatus;
  price_usd: number | string | null;
  subtotal_usd: number | string | null;
  discount_usd: number | string | null;
  cost_usd: number | string | null;
  created_at: string;
  paid_at: string | null;
  items: Array<{ quantity: number | null }> | null;
}

/**
 * DECIMAL → integer cents, rounded exactly once.
 *
 * supabase-js may hand back a string or a number depending on the column type,
 * so both are handled. Anything unparseable becomes 0 rather than NaN — a NaN
 * would propagate silently through every subsequent sum and poison the total.
 */
export function toCents(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Cents → the whole-dollar float Excel wants for a currency cell. */
export function centsToAmount(cents: number): number {
  return cents / 100;
}

/** ISO-8601 week number. Weeks start Monday; week 1 contains the first Thursday. */
export function isoWeek(date: Date): { year: number; week: number } {
  // Work on a UTC copy so a server in +07:00 and one in UTC agree on the week.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current week decides which year the week belongs to.
  const dayNumber = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNumber + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: isoYear, week };
}

/** Monday 00:00:00 UTC of the week containing `date`. */
function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNumber);
  return d;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Which bucket an order falls into.
 *
 * Revenue is recognised when the money settled (paid_at), not when the customer
 * started checking out. An order created on the 31st and paid on the 1st is
 * revenue for the new month — that is what makes the report reconcile against
 * a payment processor statement instead of drifting a day at each boundary.
 */
function bucketFor(row: OrderRow, period: ReportPeriod): { key: string; label: string; start: Date; end: Date } {
  const when = new Date(row.paid_at ?? row.created_at);

  if (period === 'all') {
    return { key: 'All time', label: 'All time', start: when, end: when };
  }

  if (period === 'weekly') {
    const { year, week } = isoWeek(when);
    const start = startOfIsoWeek(when);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      key: `${year}-W${String(week).padStart(2, '0')}`,
      label: `Week ${week} · ${formatDay(start)} – ${formatDay(end)}`,
      start,
      end,
    };
  }

  const start = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
  const end = new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth() + 1, 0));
  return {
    key: `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`,
    label: `${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`,
    start,
    end,
  };
}

function emptyRow(key: string, label: string, start: string, end: string): SalesPeriodRow {
  return {
    periodKey: key,
    periodLabel: label,
    periodStart: start,
    periodEnd: end,
    orders: 0,
    unitsSold: 0,
    grossSalesCents: 0,
    discountsCents: 0,
    netSalesCents: 0,
    cogsCents: 0,
    grossProfitCents: 0,
    marginBps: null,
    refunds: 0,
    refundsCents: 0,
    ordersMissingCost: 0,
    costedNetSalesCents: 0,
  };
}

/**
 * Margin in basis points over the costed orders only.
 *
 * Integer arithmetic end to end so the percentage in the spreadsheet and any
 * percentage computed elsewhere agree exactly, with no rounding step between.
 */
export function marginBpsOf(netSalesCents: number, cogsCents: number): number | null {
  if (netSalesCents <= 0) return null;
  return Math.round(((netSalesCents - cogsCents) * 10000) / netSalesCents);
}

/** Folds one order into its period row. Exported for tests. */
export function accumulate(row: SalesPeriodRow, order: OrderRow): void {
  const price = toCents(order.price_usd);

  if (order.status === 'refunded') {
    row.refunds += 1;
    row.refundsCents += price;
    return;
  }

  if (!SETTLED.includes(order.status)) return;

  const subtotal = toCents(order.subtotal_usd);
  const discount = toCents(order.discount_usd);

  row.orders += 1;
  row.unitsSold += (order.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // Gross sales is what the plans listed for before any discount. Older rows
  // pre-date the subtotal column and default it to 0; fall back to the price so
  // gross never reads as less than net.
  row.grossSalesCents += subtotal > 0 ? subtotal : price;
  row.discountsCents += discount;
  row.netSalesCents += price;

  if (order.cost_usd === null || order.cost_usd === undefined) {
    row.ordersMissingCost += 1;
    return;
  }

  row.cogsCents += toCents(order.cost_usd);
  row.costedNetSalesCents += price;
}

/** Finalises the derived fields once every order has been folded in. */
function seal(row: SalesPeriodRow): SalesPeriodRow {
  row.grossProfitCents = row.costedNetSalesCents - row.cogsCents;
  row.marginBps = marginBpsOf(row.costedNetSalesCents, row.cogsCents);
  return row;
}

/** Builds the report from already-fetched rows. Exported so tests need no database. */
export function buildReport(
  orders: OrderRow[],
  period: ReportPeriod,
  range: { start: string | null; end: string | null } = { start: null, end: null }
): SalesReport {
  const buckets = new Map<string, SalesPeriodRow>();
  const total = emptyRow('total', 'Total', range.start ?? '', range.end ?? '');

  for (const order of orders) {
    const bucket = bucketFor(order, period);
    let row = buckets.get(bucket.key);
    if (!row) {
      row = emptyRow(bucket.key, bucket.label, isoDate(bucket.start), isoDate(bucket.end));
      buckets.set(bucket.key, row);
    }
    accumulate(row, order);
    accumulate(total, order);
  }

  // Newest period first — the number you open the file to check is at the top.
  const rows = [...buckets.values()].sort((a, b) => b.periodKey.localeCompare(a.periodKey)).map(seal);

  return {
    period,
    generatedAt: new Date().toISOString(),
    rangeStart: range.start,
    rangeEnd: range.end,
    rows,
    total: seal(total),
    hasIncompleteCost: total.ordersMissingCost > 0,
  };
}

export interface SalesReportParams {
  period: ReportPeriod;
  /** Inclusive ISO date, e.g. '2026-01-01'. */
  from?: string;
  /** Inclusive ISO date. */
  to?: string;
}

/**
 * Reads settled and refunded orders and aggregates them.
 *
 * Paged in blocks of 1,000 because PostgREST caps a single response and a
 * silently truncated read would understate revenue — the one failure mode a
 * financial report must not have.
 */
export async function buildSalesReport(params: SalesReportParams): Promise<SalesReport> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ApiError('SERVICE_UNAVAILABLE', 'Order storage is unavailable.');
  }

  const PAGE = 1000;
  const collected: OrderRow[] = [];

  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from('esim_orders')
      .select('status, price_usd, subtotal_usd, discount_usd, cost_usd, created_at, paid_at, items:order_items(quantity)')
      .in('status', [...SETTLED, 'refunded'])
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (params.from) query = query.gte('created_at', `${params.from}T00:00:00Z`);
    if (params.to) query = query.lte('created_at', `${params.to}T23:59:59Z`);

    const { data, error } = await query;

    if (error) {
      logSupabaseError('report.sales_read_failed', error, { offset });
      throw new ApiError('INTERNAL', 'Could not read orders for the report.');
    }

    const page = (data ?? []) as unknown as OrderRow[];
    collected.push(...page);
    if (page.length < PAGE) break;
  }

  log.info('report.sales_built', {
    period: params.period,
    orders: collected.length,
    from: params.from ?? null,
    to: params.to ?? null,
  });

  return buildReport(collected, params.period, {
    start: params.from ?? null,
    end: params.to ?? null,
  });
}
