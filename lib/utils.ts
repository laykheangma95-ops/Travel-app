import { USD_TO_KHR } from '@/data/destinations';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// Routes that render their own full-screen world. They supply their own
// navigation and footer, so the app's nav, footer, splash and Copilot FAB all
// stand down on them.
const STANDALONE_ROUTES = ['/apsara-hero', '/arc-01'];

export function isStandalonePage(pathname: string | null | undefined): boolean {
  return Boolean(pathname && STANDALONE_ROUTES.includes(pathname));
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatKhr(usdAmount: number): string {
  return `៛${Math.round(usdAmount * USD_TO_KHR).toLocaleString('en-US')}`;
}

export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DN-${year}-${rand}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w === 'usa' || w === 'uae' ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
