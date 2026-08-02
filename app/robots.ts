import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private and operational surfaces. /admin is also 404'd by the
        // middleware for non-admins — this just keeps it out of the index.
        disallow: [
          '/admin',
          '/api/',
          '/dashboard',
          '/my-esims',
          '/my-trips',
          '/settings',
          '/order-confirmation/',
          '/track/',
        ],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
