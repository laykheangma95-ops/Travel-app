import { NextResponse } from 'next/server';
import { createAbaPayment, verifyAbaWebhook } from '@/lib/aba';
import { getSupabaseAdmin } from '@/lib/supabase';
import { notifyAdminNewOrder } from '@/lib/telegram';
import { sendOrderConfirmationEmail } from '@/lib/resend';
import { generateOrderNumber } from '@/lib/utils';
import { createTelegramConnect } from '@/lib/esimDelivery';
import type { CartItem, DeliveryChannel, EsimOrder } from '@/types';

interface CheckoutBody {
  customer: {
    fullName: string;
    email: string;
    phone: string;
    phoneCountry: string;
    deliveryChannel: DeliveryChannel;
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
    returnUrl: `${appUrl}/order-confirmation/${orderNumber}?method=aba`,
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
    delivery_channel: body.customer.deliveryChannel ?? 'email',
    customer_phone_country: body.customer.phoneCountry ?? null,
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
      delivery_channel: order.delivery_channel,
      customer_phone_country: order.customer_phone_country,
    });
  }

  const telegramConnectUrl =
    order.delivery_channel !== 'email'
      ? await createTelegramConnect(orderNumber, order.customer_phone)
      : null;

  if (payment.demo) {
    await Promise.allSettled([notifyAdminNewOrder(order), sendOrderConfirmationEmail(order)]);
    return NextResponse.json({ orderNumber, demo: true, telegramConnectUrl });
  }

  return NextResponse.json({
    orderNumber,
    paymentUrl: payment.paymentUrl,
    fields: payment.fields,
    telegramConnectUrl,
  });
}

// PUT /api/payments/aba — ABA PayWay webhook: verify signature, update order
export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, string>;
  if (!verifyAbaWebhook(body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const orderNumber = body.tran_id;
  const paid = body.status === '00' || body.status === 'APPROVED';
  if (supabase && orderNumber) {
    const { data: updated } = await supabase
      .from('esim_orders')
      .update({ status: paid ? 'paid' : 'cancelled', aba_payment_id: body.apv ?? null })
      .eq('order_number', orderNumber)
      .select('*')
      .single();
    if (updated && paid) {
      await Promise.allSettled([
        notifyAdminNewOrder(updated as EsimOrder),
        sendOrderConfirmationEmail(updated as EsimOrder),
      ]);
    }
  }

  return NextResponse.json({ received: true });
}
