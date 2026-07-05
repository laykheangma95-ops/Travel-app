# Domner App ✈️ 🇰🇭

**Cambodia's first Khmer-language travel super app** — eSIM store, real-time flight tracking,
step-by-step airport guidance, travel checklists, and emergency phrases. Built with Next.js 14,
TypeScript, Tailwind CSS, and Supabase.

> Travel Confidently. Stay Connected.

## Features

| Area | What it does |
| --- | --- |
| 🛒 **eSIM Store** | 20 destinations, 3 plan tiers each, cart + checkout with Stripe & ABA PayWay |
| ✈️ **Flight Guardian** | Live flight dashboard, 90-second polling, Khmer/English alerts, public share links (`/track/[token]`) |
| ✅ **Am I Ready? Checklist** | 3-step wizard that generates a personalized pre-flight checklist per destination |
| 🛫 **Airport Companion** | Step-by-step departure & arrival walkthroughs for 10 airports, scam warnings included |
| 🆘 **Emergency Phrases** | Tap-to-copy phrases in Vietnamese, Thai, Chinese, Japanese — works offline |
| 🎉 **Arrival Experience** | Auto-triggered welcome card with exchange rate, baggage, and safe-taxi info |
| 📸 **Trip Memories** | Shareable trip summary cards with photos and stats |
| 🤝 **Affiliate Program** | 30% commission, referral links with auto-applied discounts |
| 🔐 **Admin Panel** | Orders, eSIM PDF generator, affiliate approvals, dashboards |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in keys (all optional — see Demo mode)
npm run dev                  # http://localhost:3000
```

### Demo mode

The app runs fully **without any API keys**: flight data is served from a realistic mock,
payments complete in sandbox mode, and auth/dashboard pages show demo data. Add keys to
`.env.local` one service at a time to go live:

| Service | Variables | Used for |
| --- | --- | --- |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | Auth, orders, saved flights (schema in `supabase/schema.sql`) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | International card payments |
| ABA PayWay | `ABA_MERCHANT_ID`, `ABA_API_KEY`, `ABA_WEBHOOK_SECRET` | KHQR / ABA payments |
| AeroDataBox | `RAPIDAPI_KEY`, `AEROBOX_HOST` | Real flight data |
| Firebase | `FIREBASE_ADMIN_SDK`, `NEXT_PUBLIC_FIREBASE_CONFIG` | Push notifications |
| Resend | `RESEND_API_KEY` | Order confirmation emails |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Admin order alerts |
| Admin | `ADMIN_EMAIL` | Gates `/admin` |

### Database setup

Run `supabase/schema.sql` in the Supabase SQL editor — it creates all tables with
Row Level Security policies and the signup trigger.

## Project structure

```
app/            Pages (App Router) + API routes
components/     ui / layout / esim / flights / trips / admin / auth
lib/            Supabase, Stripe, ABA PayWay, AeroDataBox, FCM, Resend, Telegram
data/           Destinations, plans, airport guides, phrases, customs, scam alerts
hooks/          useCart (Zustand), useFlightTracking, useNotifications
supabase/       schema.sql
types/          Shared TypeScript types
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run typecheck` — strict TypeScript check
- `npm run lint` — ESLint
