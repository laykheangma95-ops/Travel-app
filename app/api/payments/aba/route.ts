import { NextResponse } from 'next/server';
import { createAbaPayment } from '@/lib/aba';
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
    deviceType: string;
    notes?: string;
  };
  items: CartItem[];
  totalUsd: number;
}

// POST /api/payments/aba — create an order + ABA PayWay payment
export async function POST(request: Request) {
  const body = (await request.json()) as CheckoutBody;
  if (!body.customer?.email || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Invalid checkout payload' }, { status: 400 });
  }

  const orderNumber = generateOrderNumber();
  const first = body.items[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://domnerapp.com';

  const payment = createAbaPayment({
    amountUsd: body.totalUsd,
    orderNumber,
    customerName: body.customer.fullName,
    customerEmail: body.customer.email,
    customerPhone: body.customer.phone,
    items: body.items.map((i) => ({
      name: `${i.countryName} ${i.planName}`,
      quantity: i.quantity,
      priceUsd: i.priceUsd,
    })),
    // Server-to-server confirmation — ABA POSTs here once the payment settles.
    pushbackUrl: `${appUrl}/api/payments/aba/callback`,
    successUrl: `${appUrl}/order-confirmation/${orderNumber}?method=aba`,
    cancelUrl: `${appUrl}/cart?cancelled=1`,
  });

  const order: EsimOrder = {
    id: orderNumber,
    user_id: null,
    order_number: orderNumber,
    country: body.items.map((i) => i.countryName).join(', '),
    plan_name: body.items.map((i) => `${i.countryName} ${i.planName}`).join(', '),
    duration_days: first.durationDays,
    data_gb_daily: first.dataGbDaily,
    price_usd: body.totalUsd,
    status: payment.demo ? 'paid' : 'pending',
    qr_code_url: null,
    payment_method: 'aba',
    customer_name: body.customer.fullName,
    customer_email: body.customer.email,
    customer_phone: body.customer.phone,
    device_type: body.customer.deviceType,
    notes: body.customer.notes ?? null,
    created_at: new Date().toISOString(),
    fulfilled_at: null,
  };

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('esim_orders').insert({
      order_number: orderNumber,
      country: order.country,
      plan_name: order.plan_name,
      duration_days: order.duration_days,
      data_gb_daily: order.data_gb_daily,
      price_usd: order.price_usd,
      status: order.status,
      payment_method: 'aba',
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      device_type: order.device_type,
      notes: order.notes,
    });
  }

  if (payment.demo) {
    await Promise.allSettled([notifyAdminNewOrder(order), sendOrderConfirmationEmail(order)]);
    return NextResponse.json({ orderNumber, demo: true });
  }

  return NextResponse.json({
    orderNumber,
    paymentUrl: payment.paymentUrl,
    fields: payment.fields,
  });
}

// The ABA PayWay pushback (webhook) lives at /api/payments/aba/callback —
// PayWay POSTs to it, which would otherwise collide with the handler above.
