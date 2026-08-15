import type { Metadata } from 'next';
import { OrderConfirmationView } from '@/components/esim/OrderConfirmationView';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

// This page used to be entirely static. It printed whatever string was in the
// URL and declared "Your eSIM is Being Prepared!" — for a real order, a declined
// card, a cancelled ABA session, or a number typed by hand. It showed no payment
// status, no items, no amount, and no sign of which address the QR was going to.
export default function OrderConfirmationPage({ params }: { params: { id: string } }) {
  return <OrderConfirmationView orderNumber={params.id} />;
}
