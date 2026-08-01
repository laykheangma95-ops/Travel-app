// ─────────────────────────────────────────────────────────────────────────────
// Checkout input validation — shared by both payment routes.
//
// Both gateways accepted `body.customer.*` with only an email presence check,
// so an order could be created with a 4,000-character "name" or a malformed
// email that the confirmation would then bounce off. Validation lives here once
// rather than being duplicated (and drifting) per gateway.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { ApiError } from './http';
import type { CustomerDetails } from './orders';

const customerSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name.').max(120),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(254),
  phone: z.string().trim().min(6, 'Please enter your phone number.').max(32),
  contactMethod: z.enum(['telegram', 'whatsapp', 'email']).optional(),
  deviceType: z.enum(['iphone', 'android', 'not-sure']),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export interface ParsedCheckout {
  customer: CustomerDetails;
  idempotencyKey: string;
}

/**
 * Validates the customer block and resolves an idempotency key.
 *
 * The key is what stops a double-tapped "Pay" button from creating two orders
 * and two charges. A client that supplies its own key (stable per checkout
 * attempt) gets exact protection; otherwise we derive one from the customer and
 * cart so at least rapid duplicates collapse.
 */
export function parseCheckoutBody(body: Record<string, unknown>): ParsedCheckout {
  const parsed = customerSchema.safeParse(body.customer);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError('BAD_REQUEST', first?.message ?? 'Please check your details and try again.', {
      field: first?.path.join('.'),
    });
  }

  const customer: CustomerDetails = {
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    contactMethod: parsed.data.contactMethod,
    deviceType: parsed.data.deviceType,
    notes: parsed.data.notes ?? null,
  };

  const clientKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim().length >= 8
      ? body.idempotencyKey.trim().slice(0, 128)
      : null;

  return {
    customer,
    idempotencyKey: clientKey ?? derivedKey(customer.email, body.items),
  };
}

/**
 * Fallback key for clients that do not send one: the customer plus their cart,
 * bucketed into a 2-minute window. Two identical submissions seconds apart
 * collapse to one order; a genuine repeat purchase later does not.
 */
function derivedKey(email: string, items: unknown): string {
  const shape = Array.isArray(items)
    ? items
        .map((raw) => {
          const item = raw as { planId?: unknown; quantity?: unknown };
          return `${String(item?.planId ?? '')}x${String(item?.quantity ?? 1)}`;
        })
        .sort()
        .join('|')
    : '';
  const window = Math.floor(Date.now() / 120_000);
  return `auto:${email}:${shape}:${window}`;
}
