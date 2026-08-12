# Staff console — support lookup & sales reporting

Two screens for the people who answer the phone and the person who reconciles
the month. Both live under `/admin` and both require the `ADMIN_EMAIL`
allowlist plus a signed-in session.

## Getting in

1. Run `supabase/schema.sql` (fresh project) or `supabase/migrations/*.sql` in
   order (existing project). Migration `003_cost_and_reporting.sql` is required
   for margin reporting.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_KEY` and `ADMIN_EMAIL`.
3. Sign in at `/sign-in` with an allowlisted address, then open `/admin`.

`GET /api/health` reports which services are configured. The admin gate **fails
closed**: with no `ADMIN_EMAIL` set, nobody is an admin.

---

## `/admin/support` — the call-centre screen

One search box. Paste the full **order number**, **email address**, or **phone
number** the customer gives you, and it resolves to their orders.

Each result leads with a plain-language read of the situation and what to do
about it, so an operator does not need to know that "`paid`, no `fulfilled_at`,
older than five minutes" means the supplier handover is stuck:

| Order state | What the screen says |
| --- | --- |
| `pending`, under 30 min | Checkout in progress — wait and refresh |
| `pending`, over 30 min | Never paid. Nothing was charged; ask them to reorder |
| `paid`, no eSIM, under 5 min | Still being issued — wait two minutes |
| `paid`, no eSIM, over 5 min | **Stuck. Escalate — refund risk** |
| `paid`, eSIM exists | Never marked fulfilled — mark it in Orders |
| `fulfilled`, never delivered | Re-send the QR; check the email address |
| `fulfilled`, delivered | Complete — check the device is eSIM-capable |

Below that: the order, masked contact details, eSIM state, every delivery
attempt with its error, and the full event timeline.

### Why the search is exact-match only

The obvious build is `ilike %term%`. That is also a customer-enumeration tool —
type `@gmail` and read back the contact dataset a page at a time.
[`docs/LOCKED.md`](LOCKED.md) is explicit that the realistic leak path is a
helpful new endpoint, not an attacker.

So this endpoint resolves an identifier the caller **already has**. A partial
string matches nothing. On a support call you always have one of the three, so
staff lose nothing.

This also keeps the door open to handing this screen to call-centre staff on a
lower role later, without handing over the customer list with it. The existing
`/admin/orders` list keeps its substring search — browsing is an admin activity.

### What it deliberately does not show

- **Full ICCID** — last four digits only.
- **Activation code / LPA string** — never. Together with the ICCID these are
  bearer credentials: whoever reads them can install the SIM. Re-send the QR
  from `/admin/orders` instead, which delivers it to the customer rather than
  putting it on a screen someone may be sharing.
- **Full email or phone** — masked (`j•••@gmail.com`, `+855••••5678`), which is
  enough to confirm identity over the phone without making the screen worth
  screenshotting.

Every lookup is written to the log with the operator's identity.

---

## `/admin/reports` — the sales statement

Exports a formatted `.xlsx` for **Weekly**, **Monthly**, or **All time**, with
an optional date range.

**Sheet 1 — Statement.** The vertical P&L a finance person expects:

```
Gross sales
    Less: discounts
Net sales                    ← single rule above
    Cost of goods sold
Gross profit                 ← single rule above
Gross margin                 ← double rule below
```

Plus orders settled, units sold, average order value, refunds issued and
refunded value.

**Sheet 2 — By period.** One row per week or month, newest first, with a total
row and an autofilter.

Money is written as real numbers with an accounting format (`#,##0.00`,
negatives in parentheses), never pre-formatted strings — so selecting a column
and reading the sum works.

### Two things that make the numbers trustworthy

**Revenue is recognised when the money settled (`paid_at`), not when checkout
started.** An order created on the 31st and paid on the 1st is revenue for the
new month. That is what lets the report reconcile against a payment processor
statement instead of drifting a day at every boundary.

**Unknown cost is not zero cost.** Orders placed before `cost_usd` existed have
no supplier cost recorded. Treating those as free would report a 100% margin on
them. Instead they are counted in sales, excluded from COGS and margin, and
reported in a `Cost missing` column with a footnote on the statement. The margin
you read is the margin over orders that can actually support the claim — and
when no order in range has a cost, margin reads `n/a`, never `0.00%`.

Fill in `cost_usd` at fulfilment time and the margin becomes complete on its
own; nothing needs back-filling. **Never back-fill it with an estimate** — an
invented number in a financial statement is worse than a visible gap.

### Why the export has no customer data in it

`docs/LOCKED.md` names a spreadsheet export of the customer contact dataset as
the exact thing that must not exist. It is also unnecessary: a financial
statement needs aggregate money, not per-person contact details.

So the report query never selects `customer_name`, `customer_email` or
`customer_phone`. There is nothing to redact because there is nothing there.
Revenue reporting and the contact dataset stay in separate systems.

Each download is logged with the admin's identity, the period, and the row
count — taking an export is a deliberate act and the audit trail shows who did.
