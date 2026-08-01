import type { MetadataRoute } from 'next';
import { destinations } from '@/data/destinations';
import { airportGuides } from '@/data/airportGuides';
import { appUrl } from '@/lib/env';

// Every public URL, so search engines can find the destination and airport
// pages — the pages that actually earn organic traffic for a travel business.

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  const now = new Date();

  const staticRoutes: Array<{ path: string; priority: number; freq: 'daily' | 'weekly' | 'monthly' }> = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/esim', priority: 0.9, freq: 'weekly' },
    { path: '/flights', priority: 0.9, freq: 'daily' },
    { path: '/checklist', priority: 0.8, freq: 'monthly' },
    { path: '/airport-guide', priority: 0.8, freq: 'monthly' },
    { path: '/emergency', priority: 0.8, freq: 'monthly' },
    { path: '/affiliate', priority: 0.5, freq: 'monthly' },
    { path: '/privacy', priority: 0.3, freq: 'monthly' },
    { path: '/terms', priority: 0.3, freq: 'monthly' },
    { path: '/refunds', priority: 0.3, freq: 'monthly' },
  ];

  return [
    ...staticRoutes.map(({ path, priority, freq }) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: freq,
      priority,
    })),
    ...destinations.map((destination) => ({
      url: `${base}/esim/${destination.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: destination.popular ? 0.8 : 0.6,
    })),
    ...airportGuides.map((guide) => ({
      url: `${base}/airport-board/${guide.code.toLowerCase()}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ];
}
