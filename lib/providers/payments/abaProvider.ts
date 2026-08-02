// ABA PayWay (KHQR) adapter. All ABA-specific knowledge lives here.

import { createAbaPayment, isAbaConfigured, isAbaPaid, verifyAbaWebhook } from '@/lib/aba';
import { log } from '@/lib/logger';
import type {
  CreatePaymentInput,
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
} from './types';

export class AbaPaymentProvider implements PaymentProvider {
  readonly id = 'aba';
  readonly label = 'ABA PayWay (Cambodia)';

  isConfigured(): boolean {
    return isAbaConfigured();
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const payment = createAbaPayment({
      // The port carries cents; ABA's API is denominated in dollars.
      amountUsd: input.amountCents / 100,
      orderNumber: input.orderNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      returnUrl: input.returnUrl,
    });

    if (payment.demo) {
      return {
        kind: 'redirect',
        paymentId: `demo_aba_${input.orderNumber}`,
        url: payment.paymentUrl,
        demo: true,
      };
    }

    return {
      kind: 'form-post',
      paymentId: input.orderNumber,
      url: payment.paymentUrl,
      fields: payment.fields,
      demo: false,
    };
  }

  async verifyAndParseWebhook(rawBody: string, _headers: Headers): Promise<PaymentEvent | null> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      log.warn('aba.webhook_unparseable');
      return null;
    }

    if (!verifyAbaWebhook(body)) return null;

    const paid = isAbaPaid(body.status);

    return {
      orderNumber: typeof body.tran_id === 'string' ? body.tran_id : null,
      type: paid ? 'succeeded' : 'failed',
      paymentId: typeof body.apv === 'string' && body.apv ? body.apv : null,
      // ABA's callback does not carry a trustworthy settled amount, so we do
      // not invent one. The reconciliation step treats null as "cannot verify"
      // rather than "verified as correct".
      settledAmountCents: null,
      reason: paid ? null : `ABA status ${String(body.status ?? 'unknown')}`,
    };
  }
}
