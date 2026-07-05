import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendPushNotification, notificationTemplates } from '@/lib/firebase';

interface AlertRegistration {
  flightNumber: string;
  date: string;
  preferences: {
    gateChange: boolean;
    delay: boolean;
    boarding: boolean;
    landing: boolean;
    contact: string;
    language: 'km' | 'en';
  };
  fcmToken?: string;
}

// POST /api/notifications — register flight alert preferences
export async function POST(request: Request) {
  const body = (await request.json()) as AlertRegistration;
  if (!body.flightNumber || !body.date) {
    return NextResponse.json({ error: 'Missing flightNumber or date' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('saved_flights').insert({
      flight_number: body.flightNumber.replace(/\s+/g, '').toUpperCase(),
      flight_date: body.date,
      notify_gate_change: body.preferences?.gateChange ?? true,
      notify_delay: body.preferences?.delay ?? true,
      notify_boarding: body.preferences?.boarding ?? true,
      notify_landing: body.preferences?.landing ?? true,
    });
    if (body.fcmToken) {
      await supabase.from('push_subscriptions').insert({ fcm_token: body.fcmToken, device_type: 'web' });
    }
  }

  return NextResponse.json({ ok: true });
}

// PUT /api/notifications — admin/cron: send a flight event push
// Body: { event, flight, fcmToken, language, params }
export async function PUT(request: Request) {
  const body = (await request.json()) as {
    event: 'gateChange' | 'delay' | 'boarding' | 'landed';
    flight: string;
    fcmToken: string;
    language?: 'km' | 'en';
    params?: Record<string, string | number>;
  };

  if (!body.event || !body.flight || !body.fcmToken) {
    return NextResponse.json({ error: 'Missing event, flight, or fcmToken' }, { status: 400 });
  }

  const lang = body.language ?? 'km';
  const p = body.params ?? {};
  let message: { title: string; body: string };

  switch (body.event) {
    case 'gateChange':
      message = notificationTemplates.gateChange(body.flight, String(p.oldGate ?? '?'), String(p.newGate ?? '?'))[lang];
      break;
    case 'delay':
      message = notificationTemplates.delay(body.flight, Number(p.minutes ?? 0), String(p.newTime ?? '?'))[lang];
      break;
    case 'boarding':
      message = notificationTemplates.boarding(body.flight, String(p.gate ?? '?'))[lang];
      break;
    case 'landed':
      message = notificationTemplates.landed(body.flight, String(p.city ?? ''))[lang];
      break;
    default:
      return NextResponse.json({ error: 'Unknown event' }, { status: 400 });
  }

  const sent = await sendPushNotification(body.fcmToken, {
    ...message,
    url: `/flights/${body.flight.replace(/\s+/g, '')}`,
  });

  return NextResponse.json({ ok: true, sent });
}
