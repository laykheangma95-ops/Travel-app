// ─────────────────────────────────────────────────────────────────────────────
// The GoHub B2B client. SERVER ONLY — it carries the API key.
//
// Pointing this at production is an environment change, not a code change:
//
//   GOHUB_BASE_URL=http://localhost:4000/api   → the mock in mock-gohub/
//   GOHUB_BASE_URL=https://api.gohub.example/api → the real thing
//
// Nothing in this file, or anywhere else, may import mock-gohub. The mock is a
// server we talk to over HTTP, exactly like the real supplier.
// ─────────────────────────────────────────────────────────────────────────────

import { log, requestId as newRequestId } from '@/lib/logger';
import { recordApiLog, redactHeaders } from './apiLog';
import {
  GohubError,
  GohubProtocolError,
  GohubTimeoutError,
  errorForStatus,
  type GohubErrorContext,
} from './errors';
import {
  normalizeBalance,
  normalizeCategory,
  normalizeDataUsage,
  normalizeItem,
  normalizeListing,
  normalizeOrder,
} from './normalize';
import type {
  Balance,
  Category,
  CategoryQuery,
  CreateOrderInput,
  DataUsage,
  GohubBalanceRow,
  GohubCategory,
  GohubDataUsage,
  GohubEnvelope,
  GohubItem,
  GohubListing,
  GohubOrder,
  GohubPagination,
  Item,
  ItemQuery,
  Listing,
  ListingQuery,
  Order,
  OrderQuery,
  Page,
} from './types';

export interface GohubClientConfig {
  baseUrl: string;
  partnerId: string;
  apiKey: string;
  timeoutMs: number;
  /** Attempts for a retryable failure, including the first. */
  maxAttempts: number;
}

/** Read at call time, so a test can stub the environment per case. */
export function readConfig(overrides: Partial<GohubClientConfig> = {}): GohubClientConfig {
  const timeout = Number.parseInt(process.env.GOHUB_TIMEOUT_MS ?? '', 10);

  return {
    baseUrl: (overrides.baseUrl ?? process.env.GOHUB_BASE_URL ?? '').replace(/\/+$/, ''),
    partnerId: overrides.partnerId ?? process.env.GOHUB_PARTNER_ID ?? '',
    apiKey: overrides.apiKey ?? process.env.GOHUB_API_KEY ?? '',
    timeoutMs: overrides.timeoutMs ?? (Number.isFinite(timeout) && timeout > 0 ? timeout : 15_000),
    maxAttempts: overrides.maxAttempts ?? 3,
  };
}

export function isConfigured(config = readConfig()): boolean {
  return Boolean(config.baseUrl && config.partnerId && config.apiKey);
}

type Query = Record<string, string | number | undefined | null>;

export class GohubClient {
  private readonly overrides: Partial<GohubClientConfig>;

  constructor(overrides: Partial<GohubClientConfig> = {}) {
    this.overrides = overrides;
  }

  get config(): GohubClientConfig {
    return readConfig(this.overrides);
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  async getCategories(query: CategoryQuery = {}): Promise<Page<Category>> {
    const page = await this.list<GohubCategory>('/categories', {
      parentCategoryCode: query.parentCategoryCode,
      page: query.page,
      perPage: query.perPage,
    });
    return { rows: page.rows.map(normalizeCategory), pagination: page.pagination };
  }

  async getListings(query: ListingQuery = {}): Promise<Page<Listing>> {
    const page = await this.list<GohubListing>('/listings', {
      categoryCode: query.categoryCode,
      simType: query.simType,
      page: query.page,
      perPage: query.perPage,
    });
    return { rows: page.rows.map(normalizeListing), pagination: page.pagination };
  }

  async getItems(query: ItemQuery = {}): Promise<Page<Item>> {
    const page = await this.list<GohubItem>('/items', {
      listingCode: query.listingCode,
      simType: query.simType,
      page: query.page,
      perPage: query.perPage,
    });
    return { rows: page.rows.map(normalizeItem), pagination: page.pagination };
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  /**
   * Creates an order in `Pending`. Nothing is charged and no eSIM exists until
   * `confirmOrder` runs.
   *
   * A duplicate `partnerOrderReference` throws GohubDuplicateError. That is a
   * safety net, not a failure: the order already exists, so look it up with
   * `getOrders({ search: reference })` rather than generating a new reference.
   */
  async createOrder(input: CreateOrderInput): Promise<Order> {
    const order = await this.request<GohubOrder>('POST', '/orders', { body: input });
    return normalizeOrder(order);
  }

  async confirmOrder(salesCode: string): Promise<Order> {
    const order = await this.request<GohubOrder>(
      'PUT',
      `/orders/${encodeURIComponent(salesCode)}/confirmed`
    );
    return normalizeOrder(order);
  }

  async cancelOrder(salesCode: string): Promise<Order> {
    const order = await this.request<GohubOrder>(
      'PUT',
      `/orders/${encodeURIComponent(salesCode)}/canceled`
    );
    return normalizeOrder(order);
  }

  async getOrders(query: OrderQuery = {}): Promise<Page<Order>> {
    const page = await this.list<GohubOrder>('/orders', {
      search: query.search,
      salesStatus: query.salesStatus,
      fromOrderDate: query.fromOrderDate,
      toOrderDate: query.toOrderDate,
      orderType: query.orderType,
      page: query.page,
      perPage: query.perPage,
    });
    return { rows: page.rows.map(normalizeOrder), pagination: page.pagination };
  }

  /**
   * There is no single-order endpoint, so this searches and matches exactly.
   * `search` is a substring match upstream — returning the first hit would
   * eventually hand back the wrong order.
   */
  async getOrderBySalesCode(salesCode: string): Promise<Order | null> {
    const page = await this.getOrders({ search: salesCode, perPage: 50 });
    return page.rows.find((order) => order.salesCode === salesCode) ?? null;
  }

  async getOrderByReference(partnerOrderReference: string): Promise<Order | null> {
    const page = await this.getOrders({ search: partnerOrderReference, perPage: 50 });
    return (
      page.rows.find((order) => order.partnerOrderReference === partnerOrderReference) ?? null
    );
  }

  // ── Usage, balance, top-up ─────────────────────────────────────────────────

  async getDataUsage(iccid: string, options: { forceCase?: string } = {}): Promise<DataUsage> {
    const usage = await this.request<GohubDataUsage>(
      'GET',
      `/orders/data-usage/${encodeURIComponent(iccid)}`,
      // Only ever set against the mock; the real API ignores it.
      { query: { forceCase: options.forceCase } }
    );
    return normalizeDataUsage(usage);
  }

  async getBalance(): Promise<Balance> {
    const rows = await this.request<GohubBalanceRow[]>('GET', '/balance');
    return normalizeBalance(rows);
  }

  async createTopup(input: { iccid: string; itemCode: string }): Promise<void> {
    await this.request<unknown>('POST', '/orders/topup', { body: input, allowEmptyData: true });
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  private async list<T>(path: string, query: Query): Promise<Page<T>> {
    const { data, pagination } = await this.exchange<T[]>('GET', path, { query });
    return {
      rows: Array.isArray(data) ? data : [],
      pagination: pagination ?? {
        total: Array.isArray(data) ? data.length : 0,
        page: 1,
        perPage: Array.isArray(data) ? data.length : 0,
        totalPages: 1,
        count: Array.isArray(data) ? data.length : 0,
      },
    };
  }

  private async request<T>(
    method: string,
    path: string,
    options: { query?: Query; body?: unknown; allowEmptyData?: boolean } = {}
  ): Promise<T> {
    const { data } = await this.exchange<T>(method, path, options);
    return data as T;
  }

  private async exchange<T>(
    method: string,
    path: string,
    options: { query?: Query; body?: unknown; allowEmptyData?: boolean } = {}
  ): Promise<{ data: T | undefined; pagination?: GohubPagination }> {
    const config = this.config;
    if (!isConfigured(config)) {
      throw new GohubProtocolError(
        'GoHub is not configured. Set GOHUB_BASE_URL, GOHUB_PARTNER_ID and GOHUB_API_KEY.',
        { method, path }
      );
    }

    const requestId = newRequestId();
    const url = buildUrl(config.baseUrl, path, options.query);
    const headers: Record<string, string> = {
      // All three are mandatory on every endpoint, GET included.
      'Content-Type': 'application/json',
      'X-Partner': config.partnerId,
      'X-Authorization': config.apiKey,
      Accept: 'application/json',
    };

    let lastError: GohubError | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      const startedAt = Date.now();

      recordApiLog({
        requestId,
        direction: 'request',
        method,
        path,
        attempt,
        headers: redactHeaders(headers),
        body: options.body,
        at: new Date().toISOString(),
      });

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(config.timeoutMs),
          cache: 'no-store',
        });

        const text = await response.text();
        const durationMs = Date.now() - startedAt;
        const parsed = parseJson(text);
        const envelope = (parsed ?? {}) as GohubEnvelope<T>;

        recordApiLog({
          requestId,
          direction: 'response',
          method,
          path,
          attempt,
          status: response.status,
          envelopeStatus: envelope.statusCode,
          durationMs,
          body: parsed ?? text,
          at: new Date().toISOString(),
        });

        const context: GohubErrorContext = {
          status: response.status,
          envelopeStatus: envelope.statusCode,
          method,
          path,
          requestId,
          body: text.slice(0, 2_000),
        };

        // 200 and 201 are both success. GoHub returns either for a created
        // order, apparently at random, so branching on 200 is a live bug.
        if (response.status !== 200 && response.status !== 201) {
          const error = errorForStatus(
            response.status,
            envelope.message || `GoHub responded ${response.status}`,
            context
          );
          if (!error.retryable) throw error;
          lastError = error;
        } else if (parsed === null) {
          throw new GohubProtocolError('GoHub returned a body we could not parse', context);
        } else if (envelope.statusCode && envelope.statusCode >= 400) {
          // A 200 carrying an error envelope. Trust the envelope.
          const error = errorForStatus(
            envelope.statusCode,
            envelope.message || 'GoHub returned an error envelope',
            context
          );
          if (!error.retryable) throw error;
          lastError = error;
        } else if (envelope.data === undefined && !options.allowEmptyData) {
          throw new GohubProtocolError('GoHub returned a success envelope with no data', context);
        } else {
          return { data: envelope.data, pagination: envelope.pagination };
        }
      } catch (error) {
        if (error instanceof GohubError) {
          if (!error.retryable) throw error;
          lastError = error;
        } else {
          const timedOut = isAbort(error);
          const context: GohubErrorContext = { method, path, requestId };
          lastError = timedOut
            ? new GohubTimeoutError(`GoHub request timed out after ${config.timeoutMs}ms`, context)
            : new GohubTimeoutError(
                `Could not reach GoHub: ${error instanceof Error ? error.message : String(error)}`,
                context
              );

          recordApiLog({
            requestId,
            direction: 'response',
            method,
            path,
            attempt,
            durationMs: Date.now() - startedAt,
            error: lastError.message,
            at: new Date().toISOString(),
          });
        }
      }

      if (attempt < config.maxAttempts) {
        const delay = backoffMs(attempt);
        log.warn('gohub.retry', { requestId, method, path, attempt, delay });
        await sleep(delay);
      }
    }

    throw lastError ?? new GohubProtocolError('GoHub request failed', { method, path, requestId });
  }
}

/** 500ms, 1s, 2s, each with up to 250ms of jitter so retries do not synchronize. */
function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildUrl(baseUrl: string, path: string, query?: Query): string {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Shared instance for application code. Tests construct their own. */
export const gohub = new GohubClient();
