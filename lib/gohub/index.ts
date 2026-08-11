// The GoHub layer's public surface. SERVER ONLY — the client carries the API key.
//
// Import from `@/lib/gohub`, never from `mock-gohub/*`. The mock is a server we
// talk to over HTTP, selected with GOHUB_BASE_URL, exactly like the real API.

export { GohubClient, gohub, isConfigured, readConfig } from './client';
export type { GohubClientConfig } from './client';

export {
  GohubAuthError,
  GohubDuplicateError,
  GohubError,
  GohubNotFoundError,
  GohubProtocolError,
  GohubServerError,
  GohubTimeoutError,
  GohubValidationError,
} from './errors';

export {
  emptyToNull,
  flattenSpecifications,
  isActive,
  normalizeBalance,
  normalizeCategory,
  normalizeDataUsage,
  normalizeItem,
  normalizeListing,
  normalizeOrder,
  parseAllowance,
  parseDays,
  parsePriceVnd,
  readFulfilmentStatus,
  readSalesCode,
} from './normalize';

export {
  requiresKyc,
  requiresSpecialActivation,
  sellableCategories,
  sellableItems,
  sellableListings,
} from './catalog';

export { setApiLogSink } from './apiLog';
export type { ApiLogSink, GohubApiLogEntry } from './apiLog';

export {
  WEBHOOK_SIGNATURE_HEADER,
  WebhookVerificationError,
  ingestWebhook,
  parseWebhook,
  verifySignature,
  webhookKey,
} from './webhook';
export type { FulfilWebhook, GohubWebhook, SaleWebhook } from './webhook';

export type {
  Balance,
  Category,
  CreateOrderInput,
  DataAllowance,
  DataUsage,
  Item,
  Listing,
  ListingSpecs,
  Order,
  OrderLine,
  Page,
  Serial,
  UsagePackage,
} from './types';
