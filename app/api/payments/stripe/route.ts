import { NextResponse } from 'next/server';
import { createPaymentIntent, verifyStripeWebhook } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyAdminNewOrder } from '@/lib/telegram';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import { generateOrderNumber } from '@/lib/utils';
import type { CartItem, EsimOrder } from '@/types';

interface CheckoutBody {
  customer: {
    fullName: string;
    email: string;
    phone: string;
    contactMethod: string;
    deviceType: string;
    notes?: string;
  };
  items: CartItem[];
  totalUsd: number;
  referralCode?: string | null;
  discountCode?: string | null;
}

// POST /api/payments/stripe — create an order + Stripe payment intent
export async function POST(request: Request) {
  const body = (await request.json()) as CheckoutBody;
  if (!body.customer?.email || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Invalid checkout payload' }, { status: 400 });
  }

  const orderNumber = generateOrderNumber();
  const first = body.items[0];

  const order: EsimOrder = {
    id: orderNumber,
    user_id: null,
    order_number: orderNumber,
    country: body.items.map((i) => i.countryName).join(', '),
    plan_name: body.items.map((i) => `${i.countryName} ${i.planName}`).join(', '),
    duration_days: first.durationDays,
    data_gb_daily: first.dataGbDaily,
    price_usd: body.totalUsd,
    status: 'pending',
    qr_code_url: null,
    payment_method: 'stripe',
    customer_name: body.customer.fullName,
    customer_email: body.customer.email,
    customer_phone: body.customer.phone,
    device_type: body.customer.deviceType,
    notes: body.customer.notes ?? null,
    created_at: new Date().toISOString(),
    fulfilled_at: null,
  };

  const intent = await createPaymentIntent({
    amountUsd: body.totalUsd,
    orderNumber,
    customerEmail: body.customer.email,
  });

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('esim_orders').insert({
      order_number: orderNumber,
      country: order.country,
      plan_name: order.plan_name,
      duration_days: order.duration_days,
      data_gb_daily: order.data_gb_daily,
      price_usd: order.price_usd,
      status: intent.demo ? 'paid' : 'pending',
      payment_method: 'stripe',
      stripe_payment_id: intent.paymentIntentId,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      device_type: order.device_type,
      notes: order.notes,
    });
  }

  // In demo mode, treat the order as paid immediately so the flow completes.
  if (intent.demo) {
    await Promise.allSettled([notifyAdminNewOrder(order), sendOrderConfirmationEmail(order)]);
  }

  return NextResponse.json({
    orderNumber,
    clientSecret: intent.clientSecret,
    demo: intent.demo,
  });
}

// PUT /api/payments/stripe — Stripe webhook (payment_intent.succeeded / failed)
export async function PUT(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';
  const event = verifyStripeWebhook(payload, signature);
  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as { id: string; metadata?: { order_number?: string } };
    const orderNumber = intent.metadata?.order_number;
    const status = event.type === 'payment_intent.succeeded' ? 'paid' : 'cancelled';
    if (supabase && orderNumber) {
      const { data: updated } = await supabase
        .from('esim_orders')
        .update({ status })
        .eq('order_number', orderNumber)
        .select('*')
        .single();
      if (updated && status === 'paid') {
        await Promise.allSettled([
          notifyAdminNewOrder(updated as EsimOrder),
          sendOrderConfirmationEmail(updated as EsimOrder),
        ]);
      }
    }
  }

  return NextResponse.json({ received: true });
}
