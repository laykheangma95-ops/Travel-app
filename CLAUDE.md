# Domner App — working notes

Cambodia's Khmer-language travel super app: eSIM store, flight tracking,
airport guidance. Next.js 14 (App Router), TypeScript, Tailwind, Supabase.

## 🔒 Locked areas — read before editing

Authentication, customer identity, and eSIM QR delivery are **locked**. Do not
modify the files listed in **[`docs/LOCKED.md`](docs/LOCKED.md)** without the
repository owner's explicit permission for that specific change.

If a task seems to require touching them, **stop and ask first.** A general
"go ahead" on another task is not authorisation.

The short version of the invariants — the full list is in `docs/LOCKED.md`:

- Phone verification is never required to sign up or to buy.
- At least one sign-in path always works with no cellular service.
- The QR is always emailed when we hold an address.
- `telegram_links` and `esim_deliveries` are service-role only — no bulk read
  access, no export endpoint, ever.

## Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

There is no test suite and ESLint is not configured; `npm run build` and
`npm run typecheck` are the gates.

## Conventions

- Path alias `@/` maps to the repo root.
- Every external service degrades to a demo/no-op when its env var is missing
  (`getSupabase()` returns `null`, `getResend()` returns `null`, and so on).
  Preserve that — the app must run with an empty `.env`.
- Static content lives in `data/`, domain types in `types/index.ts`.
- Bilingual UI strings go through `lib/i18n.tsx` (`en` is the source of truth,
  `km` mirrors every key).
- Server-only modules must never be imported from a `'use client'` component.

## Documentation

| Doc | Contents |
| --- | --- |
| `docs/AUTH.md` | Sign-in methods, why phone verification is optional, anti-abuse |
| `docs/DELIVERY.md` | eSIM QR delivery by email/Telegram, data protection |
| `docs/LOCKED.md` | The locked file list, invariants, and unlock procedure |
| `DEPLOY.md` | Deployment |
| `STRATEGY.md` | Product strategy |
