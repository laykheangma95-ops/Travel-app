// Payment gateway registry.
//
// Adding a gateway (Wing, Acleda, a new PSP) is: write the adapter, register it
// here, add its label to the checkout page. No new route, no new order logic.

import { StripePaymentProvider } from './stripeProvider';
import { AbaPaymentProvider } from './abaProvider';
import type { PaymentProvider } from './types';

const providers = new Map<string, PaymentProvider>();

function register(provider: PaymentProvider): void {
  providers.set(provider.id, provider);
}

register(new StripePaymentProvider());
register(new AbaPaymentProvider());

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return providers.get(id);
}

/** Every registered gateway id — used to validate the route segment. */
export function paymentProviderIds(): string[] {
  return [...providers.keys()];
}

/** Gateways ready to take money, for rendering the checkout options. */
export function availablePaymentProviders(): Array<{ id: string; label: string; configured: boolean }> {
  return [...providers.values()].map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: provider.isConfigured(),
  }));
}
