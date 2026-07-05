import { NextResponse } from 'next/server';
import { destinations } from '@/data/destinations';
import { esimPlans, getPlansForCountry } from '@/data/esimPlans';
import { getSupabaseAdmin } from '@/lib/supabase';

// GET /api/esim            — all destinations + plans
// GET /api/esim?country=x  — plans for one destination
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country');

  if (country) {
    const plans = getPlansForCountry(country);
    if (plans.length === 0) {
      return NextResponse.json({ error: 'Unknown destination' }, { status: 404 });
    }
    return NextResponse.json({ plans });
  }

  return NextResponse.json({ destinations, plans: esimPlans });
}

// PATCH /api/esim — admin: mark an order fulfilled and attach the QR code URL
export async function PATCH(request: Request) {
  const body = (await request.json()) as { orderNumber?: string; qrCodeUrl?: string };
  if (!body.orderNumber) {
    return NextResponse.json({ error: 'Missing orderNumber' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const { error } = await supabase
    .from('esim_orders')
    .update({
      status: 'fulfilled',
      qr_code_url: body.qrCodeUrl ?? null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq('order_number', body.orderNumber);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
