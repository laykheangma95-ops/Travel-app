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

## ⚠️ Two app trees right now — read this first

The repo is mid-migration to the Domner platform monorepo. There are two
trees, and they are not the same app:

- **The repo root** (`app/`, `lib/`, `components/`) is the live storefront —
  Next.js 14, still the thing that ships. Unchanged.
- **`apps/` and `packages/`** are the new npm-workspaces scaffold from the
  platform build prompt: `apps/web`, `apps/ops`, `apps/worker`,
  `packages/core`, `packages/supplier`. Phase 1 only — empty shells.

**Two decisions are still open.** Do not guess at them:

1. Whether the root storefront moves into `apps/web`. It would relocate files
   listed in `docs/LOCKED.md`, so it needs the owner's sign-off.
2. Where the backend implementation comes from. The build prompt expects a
   reviewed `_staging/` directory that is not in this repo and never has
   been. Phase 2 cannot start without it.

`packages/*/src/*.ts` are mostly documented placeholders that export nothing.
`money.ts` is the exception — it is real. Do not treat a placeholder as an
implementation, and do not invent one for `crypto.ts`.

## Commands

```bash
npm run dev        # local dev server (root storefront)
npm run build      # production build (root storefront)
npm run typecheck  # tsc --noEmit (root storefront)
npm run mock       # fake GoHub supplier API on :4000 (mock-gohub/)
npm run test:contract  # GoHub contract suite; needs `npm run mock` running

npm run build:workspaces      # build apps/* and packages/*
npm run typecheck:workspaces  # typecheck apps/* and packages/*
npm run lint:workspaces       # boundary rules — see below
npm run dev:ops               # staff console on :3001
npm run dev:worker            # fulfilment worker
```

There is no test suite for the root app; `npm run build` and `npm run
typecheck` are the gates.

## Platform boundary rules

Enforced by `no-restricted-imports` in `.eslintrc.json`, and they fail the
build rather than warn:

- `apps/web` and `apps/ops` must never import `@domner/supplier`. GoHub
  authorises by IP whitelist; the credentials live only on the worker VM. A
  leaked Vercel env var must not be able to spend the prepaid balance.
- `packages/core` must not import from any app, nor from `@domner/supplier`.
- The Stripe webhook marks orders `paid` and returns. It does not call the
  worker — the worker polls Postgres. Do not turn that into an HTTP call.

`packages/core` does **not** use `import 'server-only'`: that package throws
under plain Node and `apps/worker` is plain Node. Secret-touching core modules
are kept off the `@domner/core` barrel so a client component cannot reach them
by accident; import them by subpath.

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
| `docs/GOHUB.md` | GoHub supplier client, normalization, webhooks, contract tests |
| `mock-gohub/README.md` | The local GoHub mock: running it, failure cases, spec quirks |
| `DEPLOY.md` | Deployment |
| `STRATEGY.md` | Product strategy |
