import { ok, route } from '@/lib/http';
import { getUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(
  async (request) => {
    const user = await getUser(request);
    return ok({
      signedIn: user !== null,
      userId: user?.id ?? null,
    });
  },
  { rateLimit: 'session', name: 'auth.session' }
);
