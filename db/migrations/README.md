# Database migrations

Numbered SQL, run in order. Phase 2 populates this directory from
`_staging/db/*.sql`.

**Note the collision with `supabase/migrations/`.** The existing storefront
already ships migrations there (`0001_order_integrity_and_roles.sql`,
`001_auth_methods.sql`, `002_esim_delivery.sql`), and two of those are listed
in [`docs/LOCKED.md`](../../docs/LOCKED.md). One database cannot have two
independent migration histories without them drifting apart.

Before Phase 2 runs, decide which of these is true:

1. `db/migrations/` becomes the single history and the existing
   `supabase/migrations/` files are folded into it, renumbered — this touches
   locked files and needs the owner's sign-off; or
2. `supabase/migrations/` stays the single history and the staging SQL is
   renumbered into it, and this directory goes away.

Do not populate this directory until that is settled.
