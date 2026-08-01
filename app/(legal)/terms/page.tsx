import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms on which Domner provides eSIM data plans, flight tracking and airport guidance.',
};

const LAST_UPDATED = '1 August 2026';

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: {LAST_UPDATED}.</p>

      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-4">
        <p className="!mt-0 !text-amber-900 text-sm">
          <strong>Draft for legal review.</strong> These terms describe how the service actually
          behaves today, but they have not been reviewed by a qualified lawyer. Get them reviewed
          before taking live payments — particularly the liability and refund sections.
        </p>
      </div>

      <h2>1. Agreement</h2>
      <p>
        By using domnerapp.com or buying from us, you agree to these terms. If you do not agree,
        please do not use the service.
      </p>

      <h2>2. What we provide</h2>
      <ul>
        <li><strong>eSIM data plans</strong> for travel, supplied by our mobile network partners</li>
        <li><strong>Flight tracking</strong> and alerts</li>
        <li><strong>Airport guidance</strong>, checklists and emergency phrases</li>
      </ul>

      <h2>3. eSIM purchases</h2>
      <h3>Device compatibility</h3>
      <p>
        eSIMs only work on devices that are eSIM-capable <strong>and carrier-unlocked</strong>.
        Checking that your device qualifies before you buy is your responsibility — use the device
        checker on the plan page if you are unsure. We cannot refund an eSIM that has been
        installed on an incompatible or locked device.
      </p>

      <h3>Delivery</h3>
      <p>
        We aim to deliver your QR code by email within 15 minutes of payment clearing. This is a
        target, not a guarantee. If you have not received it within 2 hours, contact support and we
        will resolve it or refund you in full.
      </p>

      <h3>Coverage and speed</h3>
      <p>
        Coverage depends on our partner networks in each destination and on local conditions. Data
        speeds are not guaranteed, and some networks apply fair-use throttling after the daily
        allowance is used. Where a plan states a daily allowance, unused data does not roll over.
      </p>

      <h3>Single use</h3>
      <p>
        Each QR code can be installed once. Keep the email — if you delete the eSIM from your
        device you may not be able to reinstall it.
      </p>

      <h2>4. Flight information — important</h2>
      <p>
        Flight tracking is provided <strong>for information only</strong>. Our data comes from
        public ADS-B networks and third-party schedule providers, and it can be delayed,
        incomplete or wrong.
      </p>
      <p>
        <strong>
          Always confirm your gate, terminal and departure time with your airline and with the
          airport&apos;s own displays.
        </strong>{' '}
        We are not liable for a missed flight, a missed connection or any related cost.
      </p>

      <h2>5. Pricing and payment</h2>
      <ul>
        <li>All prices are in US dollars and include applicable taxes unless stated otherwise.</li>
        <li>
          The price charged is the price shown in our catalog at the moment your order is created.
          If a displayed price is obviously wrong, we may cancel the order and refund you in full
          rather than honour it.
        </li>
        <li>Promotional codes cannot be combined; the larger single discount applies.</li>
        <li>Payment is taken by Stripe or ABA PayWay; their terms also apply to the transaction.</li>
      </ul>

      <h2>6. Refunds</h2>
      <p>
        See our <a href="/refunds">Refund Policy</a>, which forms part of these terms.
      </p>

      <h2>7. Accounts</h2>
      <p>
        You are responsible for keeping your password secure and for activity under your account.
        Tell us immediately if you believe it has been compromised. We may suspend an account
        involved in fraud or abuse.
      </p>

      <h2>8. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Resell our eSIMs without a written agreement with us</li>
        <li>Interfere with the service or attempt to access data that is not yours</li>
        <li>Automate requests at a rate that degrades the service for other travelers</li>
        <li>Use the service for anything unlawful</li>
      </ul>

      <h2>9. Affiliate program</h2>
      <p>
        Affiliates earn commission on qualifying orders placed through their referral link.
        Commission is not payable on cancelled or refunded orders, and we may withhold it where
        we detect self-referral or artificially generated traffic. Full terms are provided when an
        application is approved.
      </p>

      <h2>10. Liability</h2>
      <p>
        We provide the service with reasonable skill and care, but to the extent permitted by law
        our total liability for any claim is limited to the amount you paid us for the order the
        claim relates to. We are not liable for indirect or consequential losses, including missed
        flights, lost bookings or lost earnings.
      </p>
      <p>Nothing here limits liability that cannot lawfully be limited.</p>

      <h2>11. Changes and termination</h2>
      <p>
        We may update these terms; material changes will be notified to account holders by email.
        We may suspend or end the service, in which case we will refund any undelivered orders.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws of the Kingdom of Cambodia, and the courts of
        Cambodia have exclusive jurisdiction.
      </p>

      <h2>13. Contact</h2>
      <p>
        <a href="mailto:support@domnerapp.com">support@domnerapp.com</a> — 24/7 Khmer support.
      </p>
    </>
  );
}
