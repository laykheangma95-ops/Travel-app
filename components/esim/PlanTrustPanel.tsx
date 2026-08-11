import { LifeBuoy, QrCode, ShieldCheck, Wifi } from 'lucide-react';

/**
 * The replacement promise.
 *
 * THIS IS AN OPERATIONAL COMMITMENT, NOT COPY. Printing it means a customer in
 * Bangkok at 2am with a dead eSIM expects a working replacement within the hour,
 * in Khmer. Only leave this on while someone is actually rostered to honour it —
 * a promise on the product page that support cannot keep does more damage than
 * never having made it.
 *
 * Set to `null` to remove the panel everywhere it appears.
 */
export const REPLACEMENT_PROMISE: { hours: number } | null = { hours: 1 };

/**
 * The three things that go wrong with a travel eSIM, answered before purchase.
 *
 * Every line here is a real support ticket we would otherwise receive. Installing
 * on arrival with no connection is the big one: the QR needs internet to install,
 * so a traveller who waits until they land is stuck at the airport with no data
 * and no way to fix it.
 */
const INSTALL_STEPS = [
  {
    icon: QrCode,
    title: 'Install before you fly',
    body: 'Scan the QR and add the plan in your phone settings while you still have Wi-Fi. Installing needs internet — doing it after you land is the most common way to get stuck.',
  },
  {
    icon: Wifi,
    title: 'Switch it on after you arrive',
    body: 'Installed is not activated. Your days only start counting when the eSIM first connects to a network abroad, so nothing is wasted while you are still home.',
  },
  {
    icon: ShieldCheck,
    title: 'Keep a copy of the QR',
    body: 'We email it, and it stays in My eSIMs. Save a screenshot or print it — a phone that resets mid-trip cannot open its own email.',
  },
];

export function PlanTrustPanel() {
  return (
    <section aria-labelledby="plan-trust-heading" className="mt-12">
      <h2 id="plan-trust-heading" className="sr-only">
        Support and installation
      </h2>

      {REPLACEMENT_PROMISE && (
        <div className="night-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full liquid-glass-accent"
            aria-hidden="true"
          >
            <LifeBuoy size={22} className="text-primary-deep" />
          </span>
          <div>
            <p className="font-display text-lg font-bold text-white">
              {REPLACEMENT_PROMISE.hours}-hour eSIM replacement
            </p>
            <p className="mt-1 text-sm text-white/70">
              If your eSIM will not install or will not connect, message us and we will issue a new
              one within {REPLACEMENT_PROMISE.hours} hour — in Khmer, at no extra cost.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {INSTALL_STEPS.map((step) => (
          <div key={step.title} className="night-card p-6">
            <step.icon size={20} aria-hidden="true" className="text-gold-light" />
            <p className="mt-3 font-display text-base font-bold text-white">{step.title}</p>
            <p className="mt-1.5 text-sm text-white/65">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
