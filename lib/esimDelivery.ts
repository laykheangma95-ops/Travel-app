// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEsimQrEmail } from '@/lib/resend';
import { connectUrl, createConnectToken, sendEsimQrToChat } from '@/lib/telegram';
import type { DeliveryChannel, EsimOrder } from '@/types';

// Server-only. Every function here touches customer contact data and must run
// behind the service role — never import this from a client component.

export interface DeliveryOutcome {
  email: boolean;
  telegram: boolean;
  /** Deep link to show on the confirmation page when Telegram was chosen. */
  telegramConnectUrl: string | null;
}

async function logDelivery(
  orderNumber: string,
  channel: 'email' | 'telegram',
  succeeded: boolean,
  error?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from('esim_deliveries').insert({
    order_number: orderNumber,
    channel,
    succeeded,
    error: error ?? null,
  });
}

/**
 * Mint the one-time Telegram connect link for an order.
 *
 * Called at checkout, not at fulfilment, so the confirmation page can show the
 * "Connect Telegram" button immediately — the customer connects while they are
 * still looking at the screen, and the QR lands the moment ops generates it.
 */
export async function createTelegramConnect(
  orderNumber: string,
  expectedPhone: string | null
): Promise<string | null> {
  const { token, hash } = createConnectToken();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from('telegram_links').insert({
      order_number: orderNumber,
      token_hash: hash,
      expected_phone: expectedPhone,
    });
    if (error) return null;
  }
  return connectUrl(token);
}

/**
 * Deliver a fulfilled eSIM to whichever channels the customer chose.
 *
 * Email is attempted whenever we hold an address, even for 'telegram' —
 * a QR code trapped behind a step the customer never completed is a support
 * ticket, and the mail is also their receipt.
 */
export async function deliverEsim(order: EsimOrder): Promise<DeliveryOutcome> {
  const channel: DeliveryChannel = order.delivery_channel ?? 'email';
  const outcome: DeliveryOutcome = { email: false, telegram: false, telegramConnectUrl: null };
  const supabase = getSupabaseAdmin();

  if (order.customer_email) {
    outcome.email = await sendEsimQrEmail(order);
    await logDelivery(order.order_number, 'email', outcome.email);
  }

  if (channel !== 'email') {
    if (order.telegram_chat_id) {
      outcome.telegram = await sendEsimQrToChat(order.telegram_chat_id, order);
      await logDelivery(
        order.order_number,
        'telegram',
        outcome.telegram,
        outcome.telegram ? undefined : 'sendPhoto failed'
      );
    } else {
      // Chose Telegram but never tapped Start. Not an error — email carried it.
      await logDelivery(order.order_number, 'telegram', false, 'chat not linked');
    }
  }

  if (supabase) {
    const now = new Date().toISOString();
    await supabase
      .from('esim_orders')
      .update({
        delivered_email_at: outcome.email ? now : null,
        delivered_telegram_at: outcome.telegram ? now : null,
      })
      .eq('order_number', order.order_number);
  }

  return outcome;
}
