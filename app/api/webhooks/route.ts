import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Generic internal webhook endpoint for lightweight app events:
//  - affiliate.click  — a visitor landed with ?ref=CODE
//  - affiliate.apply  — a new affiliate application was submitted
// (Payment provider webhooks live under /api/payments/*.)
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = typeof body.type === 'string' ? body.type : '';
  const supabase = getSupabaseAdmin();

  switch (type) {
    case 'affiliate.click': {
      const code = typeof body.referralCode === 'string' ? body.referralCode : null;
      if (supabase && code) {
        const { data: affiliate } = await supabase
          .from('affiliates')
          .select('id, total_clicks')
          .eq('referral_code', code)
          .single();
        if (affiliate) {
          await supabase.from('affiliate_events').insert({ affiliate_id: affiliate.id, event_type: 'click' });
          await supabase
            .from('affiliates')
            .update({ total_clicks: (affiliate.total_clicks as number) + 1 })
            .eq('id', affiliate.id);
        }
      }
      return NextResponse.json({ ok: true });
    }

    case 'affiliate.apply': {
      if (supabase && typeof body.name === 'string' && typeof body.email === 'string') {
        const code = `${body.name.split(' ')[0].toUpperCase()}${Math.floor(10 + Math.random() * 90)}`;
        await supabase.from('affiliates').insert({
          name: body.name,
          email: body.email,
          phone: typeof body.phone === 'string' ? body.phone : null,
          telegram: typeof body.telegram === 'string' ? body.telegram : null,
          referral_code: code,
          status: 'pending',
        });
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ ok: true, ignored: true });
  }
}
