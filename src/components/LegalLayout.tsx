import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PRIVACY_VERSION, LEGAL_CONTACT_EMAIL, POLICY_UPDATED, TERMS_VERSION } from '@/lib/legal';

/**
 * Shell for the public legal pages (Terms, Privacy). Kept dependency-free so it can render with or
 * without a session; the typography is applied with descendant selectors so the page bodies can be
 * written as plain semantic HTML.
 */
export function LegalLayout({
  title,
  version,
  children,
}: {
  title: string;
  version: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-[760px] p-4 sm:p-6 lg:p-8">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden /> Back to Construction Ledger
      </Link>

      <h1 className="mt-2 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-ink-3">
        Last updated {POLICY_UPDATED} · version {version}
      </p>

      <div
        className="mt-6 space-y-4 text-[15px] leading-7 text-ink-2 [&_a]:text-primary [&_a]:underline [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      >
        {children}
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-sm text-ink-3">
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/blog" className="hover:text-ink">
            Blog
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy Policy
          </Link>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="hover:text-ink">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </nav>
        <p className="mt-2">
          Terms version {TERMS_VERSION} · Privacy version {PRIVACY_VERSION}
        </p>
      </footer>
    </main>
  );
}
