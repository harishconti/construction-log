import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BlogLayout } from '@/components/BlogLayout';
import { BlogBody } from '@/components/BlogBody';
import { allPosts, getPost } from '@/lib/blog';
import { formatDate } from '@/lib/format';

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: 'Guide not found · Construction Ledger' };
  return { title: `${post.title} · Construction Ledger`, description: post.description };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  return (
    <BlogLayout
      title={post.title}
      meta={
        <p>
          {formatDate(post.date)} · {post.readingMinutes} min read
          {post.tags.length > 0 ? ` · ${post.tags.join(', ')}` : ''}
        </p>
      }
    >
      <p className="text-[15px] leading-7 text-ink-2">{post.description}</p>
      <BlogBody blocks={post.body} />

      <Link
        href="/blog"
        className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"
      >
        <ArrowLeft size={16} aria-hidden /> All guides
      </Link>
    </BlogLayout>
  );
}
