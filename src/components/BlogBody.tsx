import Link from 'next/link';
import { AlertTriangle, ChevronRight, Info, Lightbulb, type LucideIcon } from 'lucide-react';
import type { BlogBlock } from '@/lib/blog';

const CALLOUT: Record<'info' | 'tip' | 'warn', string> = {
  info: 'bg-primary-tint',
  tip: 'bg-ok-tint',
  warn: 'bg-warn-tint',
};

const CALLOUT_ICON: Record<'info' | 'tip' | 'warn', LucideIcon> = {
  info: Info,
  tip: Lightbulb,
  warn: AlertTriangle,
};

const CALLOUT_ICON_TONE: Record<'info' | 'tip' | 'warn', string> = {
  info: 'text-primary',
  tip: 'text-ok',
  warn: 'text-warn',
};

/** Renders the structured body of a blog post. Styling is explicit per block (no descendant bleed). */
export function BlogBody({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={i} className="mt-8 font-display text-lg font-semibold text-ink">
                {block.text}
              </h2>
            );
          case 'p':
            return (
              <p key={i} className="mt-3 leading-7 text-ink-2">
                {block.text}
              </p>
            );
          case 'ul':
            return (
              <ul key={i} className="mt-3 list-disc space-y-1 pl-5 leading-7 text-ink-2">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="mt-3 list-decimal space-y-1 pl-5 leading-7 text-ink-2">
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
          case 'steps':
            return (
              <ol key={i} role="list" className="mt-4 space-y-3">
                {block.items.map((item, j) => (
                  <li key={j} role="listitem" className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-semibold text-primary"
                    >
                      {j + 1}
                    </span>
                    <span className="text-ink-2">
                      <span className="block font-semibold text-ink">{item.title}</span>
                      <span className="block leading-7">{item.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            );
          case 'callout': {
            const Icon = CALLOUT_ICON[block.tone];
            return (
              <div
                key={i}
                role="note"
                className={`mt-4 flex items-start gap-2 rounded-md px-3 py-2 text-sm leading-6 text-ink-2 ${CALLOUT[block.tone]}`}
              >
                <Icon size={18} aria-hidden className={`mt-0.5 shrink-0 ${CALLOUT_ICON_TONE[block.tone]}`} />
                <span>{block.text}</span>
              </div>
            );
          }
          case 'links':
            return (
              <div key={i} className="mt-4 grid gap-2 sm:grid-cols-2">
                {block.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface p-3 transition hover:border-border-strong hover:shadow-e1"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{item.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-3">{item.text}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </div>
            );
        }
      })}
    </>
  );
}
