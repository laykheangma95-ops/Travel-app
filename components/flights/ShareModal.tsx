'use client';

import { useMemo, useState } from 'react';
import { Copy, Check, Send, Facebook, Users } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { FlightStatus } from '@/types';
import { FlightStatusBadge } from './FlightStatusBadge';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  flight: FlightStatus;
  date: string;
}

export function ShareModal({ open, onClose, flight, date }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  // Share token is derived per flight+date; a real backend row is created by /api/flights POST.
  const shareUrl = useMemo(() => {
    const token = `${flight.flightNumber.replace(/\s+/g, '').toLowerCase()}-${date}`;
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://domnerapp.com';
    return `${base}/track/${token}`;
  }, [flight.flightNumber, date]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. non-HTTPS) — user can select the URL text instead.
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share this flight">
      {/* Share card preview */}
      <div className="rounded-card bg-primary p-5 text-white">
        <div className="flex items-center justify-between">
          <p className="font-mono text-lg font-bold">{flight.flightNumber}</p>
          <FlightStatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
        </div>
        <p className="mt-1 text-xs text-white/60">{flight.airline}</p>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-2xl font-bold">{flight.departure.airport}</p>
            <p className="text-xs text-white/60">{flight.departure.city}</p>
          </div>
          <span className="text-white/40">✈</span>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold">{flight.arrival.airport}</p>
            <p className="text-xs text-white/60">{flight.arrival.city}</p>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-white/60">
          <Users size={13} aria-hidden="true" />
          {flight.trackerCount ?? 1} people are tracking this flight
        </p>
      </div>

      <p className="mt-4 break-all rounded-btn bg-surface-3 px-3.5 py-2.5 font-mono text-xs text-ink-secondary">
        {shareUrl}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-secondary px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#162c4a]"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Track flight ${flight.flightNumber} live on Domner`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-[#229ED9] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Send size={14} /> Telegram
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-btn bg-[#1877F2] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Facebook size={14} /> Facebook
        </a>
      </div>
      <p className="mt-3 text-center text-xs text-ink-muted">
        Anyone with the link can watch live status — no account needed.
      </p>
    </Modal>
  );
}
