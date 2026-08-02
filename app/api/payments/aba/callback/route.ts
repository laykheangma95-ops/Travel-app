import { NextResponse } from 'next/server';
import { isAbaPaymentApproved, verifyAbaWebhook } from '@/lib/aba';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyAdminNewOrder } from '@/lib/telegram';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import type { EsimOrder } from '@/types';

// Register this URL with ABA as the pushback URL:
//   https://domnerapp.com/api/payments/aba/callback

async function readBody(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';
  // PayWay posts form-encoded by default, but can be configured for JSON.
  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, string>;
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string') out[key] = value;
  });
  return out;
}

// POST /api/payments/aba/callback — verify signature, then settle the order.
export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await readBody(request);
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  if (!verifyAbaWebhook(body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const orderNumber = body.tran_id;
  if (!orderNumber) {
    return NextResponse.json({ error: 'Missing tran_id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const paid = isAbaPaymentApproved(body.status);

    // Scoping the update to `pending` makes retries idempotent: PayWay resends
    // the pushback until it gets a 200, and we must not email twice.
    const { data: updated } = await supabase
      .from('esim_orders')
      .update({ status: paid ? 'paid' : 'cancelled', aba_payment_id: body.apv ?? null })
      .eq('order_number', orderNumber)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (updated && paid) {
      await Promise.allSettled([
        notifyAdminNewOrder(updated as EsimOrder),
        sendOrderConfirmationEmail(updated as EsimOrder),
      ]);
    }
  }

  // Always 200 on a verified pushback, otherwise PayWay keeps retrying.
  return NextResponse.json({ received: true });
}
