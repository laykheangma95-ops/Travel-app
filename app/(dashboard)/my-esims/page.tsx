'use client';

import { useEffect, useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatDate, formatUsd } from '@/lib/utils';
import { useLang, type DictKey } from '@/lib/i18n';
import type { OrderStatus } from '@/types';

// Real orders from /api/orders. This page used to render two hardcoded eSIMs
// ("Thailand, 5 days left") that every customer saw identically, while their
// actual purchases were invisible.

interface OrderItem {
  plan_id: string;
  country_name: string;
  plan_name: string;
  quantity: number;
  duration_days: number;
  data_gb_daily: number;
  line_total_usd: number;
}

interface Order {
  id: string;
  order_number: string;
  country: string;
  plan_name: string;
  duration_days: number;
  data_gb_daily: number;
  price_usd: number;
  status: OrderStatus;
  qr_code_url: string | null;
  esim_activation_code: string | null;
  created_at: string;
  fulfilled_at: string | null;
  items?: OrderItem[];
}

const statusTone: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  paid: 'info',
  fulfilled: 'success',
  cancelled: 'danger',
  refunded: 'neutral',
};

const statusLabel: Record<OrderStatus, DictKey> = {
  pending: 'esims.status.pending',
  paid: 'esims.status.paid',
  fulfilled: 'esims.status.fulfilled',
  cancelled: 'esims.status.cancelled',
  refunded: 'esims.status.refunded',
};

export default function MyEsimsPage() {
  const { t } = useLang();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Stored as a key, not a rendered sentence, so switching language re-renders
  // the error in the new one instead of stranding English on a Khmer page.
  // `text` is the escape hatch for a message the server already worded.
  const [error, setError] = useState<{ key?: DictKey; text?: string } | null>(null);
  const [viewing, setViewing] = useState<Order | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/orders', { credentials: 'include' });
        const data = (await res.json().catch(() => null)) as {
          orders?: Order[];
          error?: { message?: string };
        } | null;

        if (!active) return;

        if (res.status === 401) {
          setError({ key: 'esims.signInPrompt' });
          return;
        }
        if (!res.ok) {
          const message = data?.error?.message;
          setError(message ? { text: message } : { key: 'esims.loadFailed' });
          return;
        }

        setOrders(data?.orders ?? []);
      } catch (e) {
        if (active) setError(e instanceof Error ? { text: e.message } : { key: 'esims.loadFailed' });
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{t('esims.title')}</h1>
        <p className="mt-1.5 text-sm text-ink-secondary">{t('esims.sub')}</p>
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t('esims.loading')}
        </p>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-card border border-line bg-surface-3 p-6 text-center">
          <p className="text-sm text-ink-secondary">
            {error.key ? t(error.key) : error.text}
          </p>
          <Button href="/sign-in?returnTo=/my-esims" size="sm" className="mt-4">
            {t('esims.signIn')}
          </Button>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title={t('esims.empty.title')}
          description={t('esims.empty.desc')}
          ctaLabel={t('esims.empty.cta')}
          ctaHref="/esim"
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-bold text-ink">{order.country}</h2>
                  <p className="mt-0.5 text-sm text-ink-secondary">
                    {t('esims.planLine', {
                      plan: order.plan_name,
                      days: order.duration_days,
                      gb: order.data_gb_daily,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    <span className="font-mono">{order.order_number}</span> ·{' '}
                    {formatDate(order.created_at)} · {formatUsd(Number(order.price_usd))}
                  </p>
                </div>
                <Badge tone={statusTone[order.status]}>{t(statusLabel[order.status])}</Badge>
              </div>

              {order.status === 'paid' && (
                <p className="mt-4 rounded-btn bg-surface-3 p-3 text-sm text-ink-secondary">
                  {t('esims.paidNote')}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-5">
                {order.status === 'fulfilled' && (order.qr_code_url || order.esim_activation_code) && (
                  <Button size="sm" onClick={() => setViewing(order)}>
                    {t('esims.viewQr')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" href="https://t.me/domnerapp">
                  {t('esims.support')}
                </Button>
                {(order.status === 'fulfilled' || order.status === 'refunded') && (
                  <Button variant="outline" size="sm" href="/esim">
                    {t('esims.buyAgain')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? t('esims.modalTitle', { country: viewing.country }) : ''}
      >
        {viewing && (
          <div className="space-y-4 text-center">
            {viewing.qr_code_url && (
              /* eslint-disable-next-line @next/next/no-img-element -- supplier-hosted QR on an
                 arbitrary domain; next/image would need every supplier allowlisted. */
              <img
                src={viewing.qr_code_url}
                alt={t('esims.qrAlt', { order: viewing.order_number })}
                width={240}
                height={240}
                className="mx-auto rounded-card border border-line"
              />
            )}
            {viewing.esim_activation_code && (
              <div className="text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t('esims.manualCode')}
                </p>
                <code className="mt-1 block break-all rounded-btn bg-surface-3 p-3 text-xs">
                  {viewing.esim_activation_code}
                </code>
              </div>
            )}
            <p className="text-xs text-ink-muted">
              {t('esims.installNote')}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
