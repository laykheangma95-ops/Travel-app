'use client';

// 🔒 LOCKED — see docs/LOCKED.md. Do not modify without the owner's explicit permission.
import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';

/**
 * Shown on the order confirmation page when the customer chose Telegram
 * delivery. The deep link is minted server-side at checkout and handed over in
 * sessionStorage, so it never appears in the URL.
 */
export function TelegramConnectCard({ orderNumber }: { orderNumber: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(sessionStorage.getItem(`domner-tg-${orderNumber}`));
  }, [orderNumber]);

  if (!url) return null;

  return (
    <div className="mt-8 rounded-card border border-secondary/30 bg-secondary/5 p-7 text-left">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <Send size={18} className="text-secondary" aria-hidden="true" />
        One tap to get your QR on Telegram
      </h2>
      <p className="mt-2 text-sm text-ink-secondary">
        Telegram won&apos;t let us message you from a phone number alone. Tap below to open our bot
        and press <strong className="text-ink">Start</strong> — your QR code arrives in that chat as
        soon as it&apos;s ready.
      </p>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-btn bg-secondary px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#162c4a]"
      >
        <Send size={16} aria-hidden="true" />
        Connect Telegram
      </a>

      <p className="mt-4 text-xs text-ink-muted">
        Paying on a laptop? Open this page on your phone, or search for our bot in Telegram and send
        it your order number <span className="font-mono text-ink-secondary">{orderNumber}</span>.
        We&apos;re emailing the QR either way.
      </p>
    </div>
  );
}
