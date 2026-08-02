import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What personal data Domner collects, why we collect it, who we share it with, and how to exercise your rights.',
};

const LAST_UPDATED = '1 August 2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>
        Last updated: {LAST_UPDATED}. This policy explains what Domner (&ldquo;we&rdquo;) collects
        when you use domnerapp.com, why, and what you can ask us to do about it.
      </p>

      <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-4">
        <p className="!mt-0 !text-amber-900 text-sm">
          <strong>Draft for legal review.</strong> This document accurately describes what the
          application currently does, but it has not yet been reviewed by a qualified lawyer.
          Have it reviewed against Cambodian consumer law — and against the GDPR if you market to
          the EU — before taking live payments.
        </p>
      </div>

      <h2>1. Who we are</h2>
      <p>
        Domner is a travel service operating in Cambodia, providing eSIM data plans, flight
        tracking and airport guidance. For questions about this policy or your data, contact{' '}
        <a href="mailto:privacy@domnerapp.com">privacy@domnerapp.com</a>.
      </p>

      <h2>2. What we collect</h2>

      <h3>When you buy an eSIM</h3>
      <ul>
        <li>Your name, email address and phone number</li>
        <li>Your device type (iPhone / Android), so we can send the right install instructions</li>
        <li>Any note you add to the order</li>
        <li>The plan you bought, the amount paid, and the order&apos;s status over time</li>
      </ul>
      <p>
        We do <strong>not</strong> receive or store your card number. Card details are entered
        directly with our payment processors and never reach our servers.
      </p>

      <h3>When you create an account</h3>
      <ul>
        <li>Your email address and an encrypted password, held by our authentication provider</li>
        <li>Optional profile details you choose to add</li>
        <li>A session cookie that keeps you signed in</li>
      </ul>

      <h3>When you track a flight or set an alert</h3>
      <ul>
        <li>The flight number and date you asked about</li>
        <li>Which alerts you enabled</li>
        <li>A push notification token, if you allowed notifications in your browser</li>
      </ul>

      <h3>Automatically</h3>
      <ul>
        <li>
          Standard server logs (request path, timestamp, error information). We deliberately
          redact email addresses and phone numbers in our logs.
        </li>
        <li>
          If you arrive through an affiliate link, a one-way hash of your IP address so the same
          visit is not counted twice. The hash cannot be reversed to identify you.
        </li>
      </ul>

      <h2>3. Why we collect it</h2>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Legal basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Delivering the eSIM you bought and supporting you afterwards</td>
            <td>Performance of a contract</td>
          </tr>
          <tr>
            <td>Sending flight alerts you asked for</td>
            <td>Consent (withdraw at any time)</td>
          </tr>
          <tr>
            <td>Preventing fraud, abuse and duplicate charges</td>
            <td>Legitimate interest</td>
          </tr>
          <tr>
            <td>Meeting tax and accounting obligations</td>
            <td>Legal obligation</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not sell your personal data, and we do not use it for advertising profiles.
      </p>

      <h2>4. Who we share it with</h2>
      <p>We share the minimum necessary with the providers that run parts of the service:</p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>What they receive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase (database &amp; authentication)</td>
            <td>Your account and order records</td>
          </tr>
          <tr>
            <td>Stripe (international card payments)</td>
            <td>Your email and the payment amount</td>
          </tr>
          <tr>
            <td>ABA PayWay (Cambodian payments)</td>
            <td>Your name, email, phone and the payment amount</td>
          </tr>
          <tr>
            <td>Resend (email delivery)</td>
            <td>Your email address and order details</td>
          </tr>
          <tr>
            <td>Firebase Cloud Messaging (push notifications)</td>
            <td>Your notification token and the alert text</td>
          </tr>
          <tr>
            <td>Our eSIM supplier</td>
            <td>The plan ordered — never your payment details</td>
          </tr>
        </tbody>
      </table>
      <p>
        Some of these providers process data outside Cambodia. We also disclose data where we are
        legally required to.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li><strong>Order records:</strong> 7 years, to meet accounting and tax requirements</li>
        <li><strong>Account data:</strong> until you delete your account</li>
        <li><strong>Flight alerts:</strong> 90 days after the flight date</li>
        <li><strong>Server logs:</strong> 30 days</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>Give you a copy of the data we hold about you</li>
        <li>Correct anything that is wrong</li>
        <li>Delete your account and associated data, subject to our accounting obligations</li>
        <li>Stop sending you flight alerts or marketing</li>
      </ul>
      <p>
        Email <a href="mailto:privacy@domnerapp.com">privacy@domnerapp.com</a> and we will respond
        within 30 days.
      </p>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit. Access to customer records is restricted to named staff
        accounts, every change to an order is recorded in an audit log, and administrative
        actions require an authenticated staff session. No system is perfectly secure; if a breach
        affects your data we will notify you.
      </p>

      <h2>8. Children</h2>
      <p>
        Domner is not intended for people under 16, and we do not knowingly collect their data.
      </p>

      <h2>9. Changes</h2>
      <p>
        If we change this policy materially, we will update the date above and notify account
        holders by email.
      </p>
    </>
  );
}
