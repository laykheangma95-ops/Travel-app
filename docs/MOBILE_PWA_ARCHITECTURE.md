# Domner mobile and PWA architecture

## Scope and source of truth

The production Domner product remains the root Next.js App Router application:

```text
app/          routes, layouts, and route handlers
components/   feature and presentation components
lib/          shared domain logic and integrations
hooks/        shared client behaviour
public/       PWA manifest, service worker, icons, offline page
supabase/     schema and database integration
```

`apps/web` and `packages/*` are workspace surfaces, not the live storefront for
this architecture. This work intentionally does not move code into them.

## What existed before this pass

- App Router pages use `app/api/*` route handlers as the primary backend
  boundary.
- Supabase handles session and database access; client components call the
  existing APIs and shared `lib/` modules rather than creating mobile-specific
  data paths.
- `Navbar` provides the broad desktop navigation and a mobile drawer.
  `BottomNavigation` is already the focused primary navigation on phone widths;
  the dashboard retains a desktop-only sidebar.
- The PWA already had a web manifest, icons, service-worker registration,
  offline page, and contextual install prompt.
- Trips, itineraries, flights, eSIMs, and notifications have real but
  differently mature capabilities. In particular, itinerary features must not
  be treated as a reason to invent a second client-side data model.

## Chosen presentation architecture

Shared domain logic remains in `lib/`, hooks, and route handlers. Presentation
can diverge only at the component layer:

```text
shared logic (lib/, hooks/, app/api/)
             |
       shared route ownership (app/)
             |
  shared components / desktop components / mobile components
             |
       PWA shell concerns (components/pwa/, public/)
```

`components/layout/DevicePresentation.tsx` is the single browser-aware source
for the application-wide device decision (`mobile` below 1024px, otherwise
`desktop`) and standalone display-mode state. It also sets
`data-domner-device` and `data-domner-display-mode` on `<html>` for CSS.

Use ordinary responsive CSS first when only layout changes. When mobile truly
needs a different presentation, add a narrowly scoped component under
`components/mobile/` (and, if justified, the parallel desktop presentation)
and read `useDevicePresentation()` there. Do not add per-feature
`window.innerWidth` checks for navigation or presentation decisions. This does
not prohibit component-local capability checks such as a canvas adapting its
rendering budget to pointer type.

`Navbar`, `BottomNavigation`, and the dashboard sidebar remain the initial
device-specific chrome. They are deliberately presentation-only: route
ownership, session access, carts, and feature data are not duplicated.

## PWA boundaries and update policy

PWA concerns live in `components/pwa/`, `public/manifest.webmanifest`,
`public/sw.js`, and the cache headers in `next.config.mjs`.

- The manifest provides standalone launch, theme/background colors, icons,
  Apple metadata through the root layout, and direct shortcuts.
- `viewportFit: 'cover'` enables safe-area-aware standalone layouts on devices
  that support it. Existing tab-bar padding continues to use
  `env(safe-area-inset-bottom)`.
- The service worker is a progressive enhancement. It is not required for
  normal browsing, auth, checkout, or any API request.
- API calls are never cached. Page navigation is network-first; only the three
  public emergency/travel-reference pages may be saved for offline fallback.
  Static assets use stale-while-revalidate.
- A new worker now waits for an explicit user action. The root PWA registration
  component shows an update notice and sends `SKIP_WAITING` only after the user
  selects **Update**. This prevents an automatic deployment refresh while a
  traveler is editing a trip or paying.
- `/sw.js` is served with no-store/revalidate headers so a browser can discover
  updates. Manifest and offline HTML also revalidate rather than remaining
  stale behind a CDN.

Run `npm run pwa:check` to validate the manifest, icon files and dimensions,
and the important conservative service-worker guards.

## Protected and intentionally untouched areas

No changes were made to auth, eSIM delivery, payments, Telegram delivery, or
their route handlers. In particular, these remain protected:

- `lib/auth.ts`, `components/auth/*`, and `app/(auth)/*`
- `lib/esimDelivery.ts` and the delivery option components
- Stripe/ABA payment routes and the Telegram webhook

No `app/api/*` route handler, Supabase schema, `apps/web`, or `packages/*` was
modified by this pass.

## Future native packaging readiness

The root app stays a web application today. Its clean deep-link routes,
centralized device presentation state, isolated PWA/browser lifecycle code, and
shared route-handler/domain layers make a future Capacitor-style iOS/Android
wrapper feasible without duplicating feature logic.

Before wrapping, choose native authentication callback handling, native push
provider integration, and an offline-data policy for private trips/orders. The
current service-worker policy intentionally does not solve offline private data,
because stale or exposed traveler data would be worse than an offline fallback.
