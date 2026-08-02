// Stripe adapter. All Stripe-specific knowledge lives here and nowhere else.

import { createPaymentIntent, settledAmountCents, verifyStripeWebhook } from '@/lib/stripe';
import { isConfigured } from '@/lib/env';
import { log } from '@/lib/logger';
import type {
  CreatePaymentInput,
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
} from './types';
import type Stripe from 'stripe';

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'stripe';
  readonly label = 'International Cards';

  isConfigured(): boolean {
    return isConfigured('stripe');
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const intent = await createPaymentIntent({
      amountCents: input.amountCents,
      orderNumber: input.orderNumber,
      customerEmail: input.customerEmail,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      kind: 'client-secret',
      paymentId: intent.paymentIntentId,
      clientSecret: intent.clientSecret,
      demo: intent.demo,
    };
  }

  async verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent | null> {
    const event = verifyStripeWebhook(rawBody, headers.get('stripe-signature') ?? '');
    if (!event) return null;

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        orderNumber: intent.metadata?.order_number ?? null,
        type: 'succeeded',
        paymentId: intent.id,
        settledAmountCents: settledAmountCents(intent),
        reason: null,
      };
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      return {
        orderNumber: intent.metadata?.order_number ?? null,
        type: 'failed',
        paymentId: intent.id,
        settledAmountCents: null,
        reason: intent.last_payment_error?.message ?? null,
      };
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      return {
        orderNumber: charge.metadata?.order_number ?? null,
        type: 'refunded',
        paymentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.id,
        settledAmountCents: null,
        reason: 'Refunded in Stripe',
      };
    }

    log.debug('stripe.webhook_ignored', { type: event.type });
    return { orderNumber: null, type: 'ignored', paymentId: null, settledAmountCents: null, reason: event.type };
  }
}
