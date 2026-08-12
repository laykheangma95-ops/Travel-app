'use client';

import { useCallback, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

// Downloads a formatted .xlsx from /api/admin/reports/sales.
//
// The file is a binary attachment, so this cannot use the usual JSON fetch
// helper: it reads the response as a blob and drives a temporary object URL.
// Errors still come back as JSON, so the content type decides how to read it.

type Period = 'weekly' | 'monthly' | 'all';

const PERIODS: Array<{ id: Period; label: string; blurb: string }> = [
  { id: 'weekly', label: 'Weekly', blurb: 'One row per ISO week, newest first.' },
  { id: 'monthly', label: 'Monthly', blurb: 'One row per calendar month.' },
  { id: 'all', label: 'All time', blurb: 'A single consolidated total.' },
];

export default function AdminReportsPage() {
  const [busy, setBusy] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const download = useCallback(
    async (period: Period) => {
      setBusy(period);
      setError(null);
      setNotice(null);

      try {
        const params = new URLSearchParams({ period });
        if (from) params.set('from', from);
        if (to) params.set('to', to);

        const res = await fetch(`/api/admin/reports/sales?${params}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(payload?.error?.message ?? 'The report could not be generated.');
        }

        const blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const suggested = /filename="([^"]+)"/.exec(disposition)?.[1];

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = suggested ?? `domner-sales-${period}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        // Revoking immediately can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);

        setNotice(`Downloaded ${anchor.download}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The report could not be generated.');
      } finally {
        setBusy(null);
      }
    },
    [from, to]
  );

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 shrink-0 text-accent" size={20} aria-hidden="true" />
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Sales statement</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              A formatted Excel workbook: gross sales, discounts, net sales, cost of goods sold,
              gross profit and margin. Two sheets — a statement summary and a period breakdown.
            </p>
            <p className="mt-2 text-xs text-ink-secondary">
              Financial figures only. No customer names, email addresses or phone numbers appear in
              the export.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-ink">Date range (optional)</h3>
        <p className="mt-1 text-xs text-ink-secondary">
          Leave both blank for every order on record.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-secondary">From</span>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-44"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-secondary">To</span>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-44"
            />
          </label>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {PERIODS.map((period) => (
          <Card key={period.id} className="flex flex-col justify-between gap-4 p-5">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">{period.label}</h3>
              <p className="mt-1 text-xs text-ink-secondary">{period.blurb}</p>
            </div>
            <Button
              onClick={() => void download(period.id)}
              disabled={busy !== null}
              className="w-full"
            >
              {busy === period.id ? (
                <>
                  <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                  Building…
                </>
              ) : (
                <>
                  <Download size={16} aria-hidden="true" />
                  Export .xlsx
                </>
              )}
            </Button>
          </Card>
        ))}
      </div>

      {(error || notice) && (
        <div
          role="status"
          className={cn(
            'rounded-btn border px-4 py-3 text-sm',
            error
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          )}
        >
          {error ?? notice}
        </div>
      )}
    </div>
  );
}
