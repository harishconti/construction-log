import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BlogLayout } from '@/components/BlogLayout';
import { allPosts } from '@/lib/blog';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Blog · Construction Ledger',
  description:
    'Guides for running a home-construction project: setup, expense tracking, budgets, the site diary, team roles and privacy.',
};

export default function BlogIndexPage() {
  const posts = allPosts();

  return (
    <BlogLayout
      title="Guides & use cases"
      meta={
        <p>
          How to run a home build on Construction Ledger — from the first expense to budgets,
          the site diary and your data.
        </p>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {posts.map((post) => (
          <li key={post.slug} className="min-w-0">
            <Link
              href={`/blog/${post.slug}`}
              className="flex h-full min-h-11 flex-col rounded-lg border border-border bg-surface p-4 transition hover:border-border-strong hover:shadow-e1"
            >
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span>{formatDate(post.date)}</span>
                <span aria-hidden>·</span>
                <span>{post.readingMinutes} min read</span>
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">
                    {tag}
                  </span>
                ))}
              </span>
              <span className="mt-2 block font-display text-lg font-semibold leading-snug text-ink">
                {post.title}
              </span>
              <span className="mt-1 block flex-1 text-sm leading-6 text-ink-2">{post.description}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                Read guide <ChevronRight size={16} aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </BlogLayout>
  );
}
