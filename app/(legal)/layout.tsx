import Link from 'next/link';

const legalNav = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/refunds', label: 'Refund Policy' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <nav aria-label="Legal documents" className="mb-10 flex flex-wrap gap-2">
        {legalNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-btn border border-line bg-white px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:border-secondary hover:text-secondary"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* `prose`-style rules kept local so the legal pages do not depend on a
          typography plugin the rest of the app does not use. */}
      <article
        className="
          [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-ink
          [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink
          [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink
          [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-ink-secondary
          [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:text-ink-secondary
          [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ol]:text-sm [&_ol]:text-ink-secondary
          [&_a]:font-medium [&_a]:text-secondary [&_a]:underline
          [&_strong]:font-semibold [&_strong]:text-ink
          [&_table]:mt-4 [&_table]:w-full [&_table]:text-left [&_table]:text-sm
          [&_th]:border-b [&_th]:border-line [&_th]:pb-2 [&_th]:font-medium [&_th]:text-ink-muted
          [&_td]:border-b [&_td]:border-line [&_td]:py-2.5 [&_td]:text-ink-secondary
        "
      >
        {children}
      </article>
    </div>
  );
}
