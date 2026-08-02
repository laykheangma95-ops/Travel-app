// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  askForContact,
  hashConnectToken,
  sendEsimQrToChat,
  sendTelegramMessage,
} from '@/lib/telegram';
import { digitsOnly } from '@/lib/phone';
import type { EsimOrder } from '@/types';

// POST /api/telegram/webhook — Telegram bot updates.
//
// Register with:
//   curl -F "url=https://<domain>/api/telegram/webhook" \
//        -F "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
//        https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook
//
// This endpoint is public, so the shared secret is the only thing standing
// between Telegram and anyone who guesses the URL. Reject early if it is unset
// rather than running unauthenticated.

export const dynamic = 'force-dynamic';

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { username?: string };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

/** Telegram sends numbers without a '+' and formatting varies by client. */
function phonesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = digitsOnly(a);
  const right = digitsOnly(b);
  if (!left || !right) return false;
  // Compare the last 8 digits: enough to identify a subscriber, tolerant of a
  // missing country code or a trunk zero the customer typed at checkout.
  return left.slice(-8) === right.slice(-8);
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, demo: true });

  // ── "/start <token>" — the deep link from the confirmation page ──────────
  const startMatch = message.text?.match(/^\/start\s+(\S+)$/);
  if (startMatch) {
    const { data: link } = await supabase
      .from('telegram_links')
      .select('id, order_number, expected_phone, expires_at, linked_at')
      .eq('token_hash', hashConnectToken(startMatch[1]))
      .maybeSingle();

    if (!link || new Date(link.expires_at) < new Date()) {
      await sendTelegramMessage(
        chatId,
        'That link has expired. Open your order page again for a fresh one, or just reply here with your order number.'
      );
      return NextResponse.json({ ok: true });
    }

    await supabase
      .from('telegram_links')
      .update({ chat_id: chatId, telegram_username: message.from?.username ?? null })
      .eq('id', link.id);

    // Ask them to confirm the number before we treat the chat as verified —
    // the deep link is a bearer token and could have been forwarded.
    if (link.expected_phone) {
      await askForContact(chatId);
    } else {
      await confirmLink(supabase, link.order_number, chatId, message.from?.username ?? null);
    }
    return NextResponse.json({ ok: true });
  }

  // ── Shared contact — completes verification ──────────────────────────────
  if (message.contact) {
    const { data: link } = await supabase
      .from('telegram_links')
      .select('id, order_number, expected_phone')
      .eq('chat_id', chatId)
      .is('linked_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!link) {
      await sendTelegramMessage(chatId, 'Thanks! There is no order waiting to be linked here.');
      return NextResponse.json({ ok: true });
    }

    if (!phonesMatch(link.expected_phone, message.contact.phone_number)) {
      await sendTelegramMessage(
        chatId,
        'That number does not match the one on the order, so we have not sent the QR here. Check your email instead, or reply and our team will sort it out.'
      );
      return NextResponse.json({ ok: true });
    }

    await confirmLink(supabase, link.order_number, chatId, message.from?.username ?? null);
    return NextResponse.json({ ok: true });
  }

  // ── Anything else ────────────────────────────────────────────────────────
  await sendTelegramMessage(
    chatId,
    'Hi! 👋 This is Domer eSIM support. Send your order number and a Khmer-speaking agent will pick it up.'
  );
  return NextResponse.json({ ok: true });
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** Mark the chat as linked and push the QR if ops has already generated it. */
async function confirmLink(
  supabase: AdminClient,
  orderNumber: string,
  chatId: number,
  username: string | null
): Promise<void> {
  const now = new Date().toISOString();

  await supabase
    .from('telegram_links')
    .update({ linked_at: now, chat_id: chatId, telegram_username: username })
    .eq('order_number', orderNumber);

  await supabase
    .from('esim_orders')
    .update({ telegram_chat_id: chatId, telegram_username: username })
    .eq('order_number', orderNumber);

  const { data: order } = await supabase
    .from('esim_orders')
    .select('*')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (order?.qr_code_url) {
    const sent = await sendEsimQrToChat(chatId, order as EsimOrder);
    await supabase.from('esim_deliveries').insert({
      order_number: orderNumber,
      channel: 'telegram',
      succeeded: sent,
      error: sent ? null : 'sendPhoto failed',
    });
    if (sent) {
      await supabase
        .from('esim_orders')
        .update({ delivered_telegram_at: now })
        .eq('order_number', orderNumber);
    }
    return;
  }

  await sendTelegramMessage(
    chatId,
    `✅ Connected. Your eSIM QR for order <code>${orderNumber}</code> will arrive here as soon as it is ready — usually within 15 minutes.`
  );
}
