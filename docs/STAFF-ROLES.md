# Staff accounts, roles & permissions

Who can use `/admin`, and how much of it.

## The short version

- **`ADMIN_EMAIL`** is the owner's break-glass access. It always works.
- **Everyone else** gets a row in `staff_users` with a role, managed at
  `/admin/staff`.
- There is **no separate staff login**. Staff sign up at `/sign-up` with the
  email address you added, and pick up their access automatically.

## The roles

| Role | For | Can | Cannot |
| --- | --- | --- | --- |
| **Viewer** | new hire | dashboard | everything else |
| **Call centre** | phone support | look up **one** customer at a time | browse the customer list, export, refund |
| **Operations** | fulfilment | call centre + order list, mark fulfilled, supplier config | refund, manage staff |
| **Finance** | bookkeeping | dashboard, sales statement, Excel export | any customer contact data at all |
| **Administrator** | owner | everything, including refunds and staff | — |

### Why Call centre and Finance are not on one ladder

Their needs are opposites. An agent needs customers and no money. A bookkeeper
needs money and no customers. Ranking them would force one to carry access it
has no business having — a finance login that can read every customer's phone
number, or a support login that can export revenue.

So roles map to an explicit **permission set**, not a rank:

| Permission | viewer | support | ops | finance | admin |
| --- | :-: | :-: | :-: | :-: | :-: |
| `dashboard.view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `customers.lookup` | | ✅ | ✅ | | ✅ |
| `orders.read` | | | ✅ | | ✅ |
| `orders.fulfil` | | | ✅ | | ✅ |
| `suppliers.manage` | | | ✅ | | ✅ |
| `reports.export` | | | | ✅ | ✅ |
| `orders.refund` | | | | | ✅ |
| `affiliates.manage` | | | | | ✅ |
| `staff.manage` | | | | | ✅ |

Routes ask for a **permission**, never a role — so re-cutting the roles later
means editing one table in `lib/staff.ts` and touching no route files.

### The gap that looks like a mistake

**Call centre does not have `orders.read`.**

That is deliberate. `orders.read` is the browsable order list, and that list
carries every customer's name, email and phone. Granting it to support would
make each agent a live copy of the contact dataset —
[`docs/LOCKED.md`](LOCKED.md) exists to prevent exactly that.

What an agent gets instead is `customers.lookup`: an **exact-match** resolve of
an identifier the customer already gave them. A partial string matches nothing.
On a support call you always have an order number, an email, or a phone number,
so nothing is lost. See [`docs/OPS-CONSOLE.md`](OPS-CONSOLE.md).

## Adding someone

1. Sign in as an admin, go to **`/admin/staff`**.
2. Enter the email address they will sign in with, pick a role, add them.
3. They sign up at `/sign-up` with that address. Their access attaches on
   signup — a database trigger links the account to the waiting row.

Reversing it is **Deactivate**, not delete: the audit trail has to keep
pointing at a real row after someone leaves. Re-adding a former colleague
restores their row rather than failing.

### Two things the server refuses

- **Changing your own role, or deactivating yourself.** Demoting yourself by
  mistake is a support ticket you cannot file from inside the product.
- **Removing the last active admin.** Checked on the server immediately before
  the write, not in the UI.

## Two-factor

`staff_users.mfa_enrolled` records who has a second factor. Enforcement is off
until you set `STAFF_REQUIRE_MFA=true`.

That order is deliberate: shipping it on would lock out every existing account
the moment it deployed. Enrol first, enforce second. The staff screen shows who
has enrolled so you can see when it is safe to flip.

Once on, a staff account without a second factor gets a specific message
telling them to enrol — not a blank panel.

## How access is actually enforced

Three independent layers. The first two are convenience; **only the third is a
security boundary**.

1. **`AdminGate`** — renders a friendly message instead of a broken page. It
   protects nothing.
2. **`middleware.ts`** — 404s `/admin` before any HTML is sent, so an anonymous
   visitor cannot tell the panel exists. It reads the caller's **own**
   `staff_users` row using their session against the anon key; RLS restricts
   that read to their row alone, so no service key is ever present at the edge.
3. **`requirePermission()` inside every `/api/admin/*` route.** This is the
   boundary. Forcing the UI open in devtools reveals a panel whose every button
   returns 403.

Nav tabs are filtered by permission rather than role name, so a tab never
points at a screen that will 403.

## Where the data lives

- **`staff_users`** — one row per person. RLS allows a signed-in user to read
  **their own row only**. Listing all staff and every write are service-role
  only, through `/api/admin/staff`. An agent cannot enumerate colleagues.
- **`staff_events`** — append-only audit of invitations, role changes and
  deactivations, with who did it. RLS on, no policy at all: service role only.

Migration: `supabase/migrations/004_staff_roles.sql`.
