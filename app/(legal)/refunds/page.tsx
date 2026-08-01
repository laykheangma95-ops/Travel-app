import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'When Domner refunds an eSIM order, and how to request one.',
};

const LAST_UPDATED = '1 August 2026';

export default function RefundsPage() {
  return (
    <>
      <h1>Refund Policy</h1>
      <p>
        Last updated: {LAST_UPDATED}. This policy forms part of our{' '}
        <a href="/terms">Terms of Service</a>. Payment processors require a published refund
        policy, and so does basic fairness.
      </p>

      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-4">
        <p className="!mt-0 !text-amber-900 text-sm">
          <strong>Draft for legal review.</strong> Check these terms against Cambodian consumer
          law before taking live payments.
        </p>
      </div>

      <h2>Full refund — always</h2>
      <p>We refund you in full, no questions asked, when:</p>
      <ul>
        <li>We fail to deliver your QR code within <strong>2 hours</strong> of payment clearing</li>
        <li>The eSIM does not activate and our support team cannot fix it</li>
        <li>There is no usable coverage in the destination the plan advertises</li>
        <li>You were charged twice for the same order</li>
        <li>You cancel before we have delivered the QR code</li>
      </ul>

      <h2>No refund</h2>
      <p>We cannot refund an eSIM once it has been installed and activated, specifically when:</p>
      <ul>
        <li>The QR code has been scanned and the plan has started</li>
        <li>Your device turned out to be carrier-locked or not eSIM-capable</li>
        <li>Your travel plans changed after activation</li>
        <li>The daily data allowance was used and speed was reduced under fair use</li>
      </ul>
      <p>
        This is because an activated eSIM is consumed at our supplier immediately and cannot be
        returned to stock.
      </p>

      <h2>Partial refund</h2>
      <p>
        If a fault on our side or our partner network&apos;s side interrupts a plan part-way
        through, we refund the unused days pro rata. Contact support with your order number and
        what happened.
      </p>

      <h2>How to request a refund</h2>
      <ol>
        <li>
          Email <a href="mailto:support@domnerapp.com">support@domnerapp.com</a> or message us on
          Telegram, with your order number (it looks like <code>DN-2026-4821</code>).
        </li>
        <li>Tell us what went wrong. Screenshots help but are not required.</li>
        <li>
          We respond within <strong>24 hours</strong> and decide within <strong>3 business
          days</strong>.
        </li>
      </ol>

      <h2>When you get the money</h2>
      <table>
        <thead>
          <tr>
            <th>Payment method</th>
            <th>Typical time to arrive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Card (Stripe)</td>
            <td>5–10 business days, back to the original card</td>
          </tr>
          <tr>
            <td>ABA PayWay / KHQR</td>
            <td>3–5 business days, back to the original account</td>
          </tr>
        </tbody>
      </table>
      <p>
        Refunds always return to the original payment method. We cannot redirect a refund to a
        different card or account.
      </p>

      <h2>Chargebacks</h2>
      <p>
        Please contact us before opening a dispute with your bank. We would almost always rather
        refund you directly and quickly than argue about it — a chargeback takes months and helps
        neither of us.
      </p>
    </>
  );
}
