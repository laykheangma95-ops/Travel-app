import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// Also what an unauthorized visitor sees at /admin — the middleware rewrites
// there rather than saying "forbidden", so nobody can confirm the panel exists.

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F5EEDC]">
        <Compass size={28} className="text-accent" aria-hidden="true" />
      </span>

      <h1 className="mt-6 font-display text-2xl font-bold text-ink">This page took a wrong turn</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        We couldn&rsquo;t find what you were looking for.
      </p>
      <p className="mt-1 text-sm text-ink-muted">រកមិនឃើញទំព័រនេះទេ។</p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/">Back to home</Button>
        <Button href="/esim" variant="outline">
          Browse eSIM plans
        </Button>
      </div>
    </div>
  );
}
