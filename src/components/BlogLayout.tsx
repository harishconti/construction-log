import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Shell for the public blog pages (index and post). */
export function BlogLayout({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
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
      {meta && <div className="mt-1 text-sm text-ink-3">{meta}</div>}

      <div className="mt-6">{children}</div>

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
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
        </nav>
      </footer>
    </main>
  );
}
