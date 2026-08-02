// POST /api/payments/aba — price the cart, create the order, start payment
// PUT  /api/payments/aba — ABA PayWay webhook
//
// 🔒 PARTIALLY LOCKED — see docs/LOCKED.md.
// The gateway-agnostic order pipeline lives in lib/payments/pipeline.ts. What
// stays here is the locked delivery step: the Telegram connect token is minted
// in this file, from this order, and only its hash is ever stored.

import { ok, route } from '@/lib/http';
import { startPayment, handlePaymentWebhook } from '@/lib/payments/pipeline';
import { createTelegramConnect } from '@/lib/esimDelivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(
  async (request) => {
    const started = await startPayment(request, 'aba');

    // 🔒 LOCKED SECTION — eSIM QR delivery.
    // Mint the Telegram deep link now so the confirmation page can offer it
    // while the customer is still on screen. Email delivery is unconditional
    // and happens in the fulfilment path; this is the additional channel only.
    const telegramConnectUrl =
      started.deliveryChannel !== 'email'
        ? await createTelegramConnect(started.orderNumber, started.customerPhone)
        : null;

    return ok({ ...started.payload, telegramConnectUrl }, { status: 201 });
  },
  { rateLimit: 'checkout', name: 'payments.aba.create' }
);

export const PUT = route(
  async (request) => ok(await handlePaymentWebhook(request, 'aba')),
  { name: 'payments.aba.webhook' }
);
