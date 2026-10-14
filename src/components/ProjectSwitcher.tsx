'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';

export type SwitcherProject = { id: string; name: string };

/** Project name button that opens a sheet listing the user's other projects. */
export function ProjectSwitcher({
  current,
  projects,
  className = '',
}: {
  current: SwitcherProject;
  projects: SwitcherProject[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`flex min-h-11 min-w-0 items-center gap-1 rounded-md px-2 text-left hover:bg-surface-2 ${className}`}
      >
        <span className="truncate font-display text-base font-semibold">{current.name}</span>
        <ChevronsUpDown size={16} aria-hidden className="shrink-0 text-ink-3" />
        <span className="sr-only">Switch project</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Switch project">
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {projects.map((p) => {
            const isCurrent = p.id === current.id;
            return (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={`flex min-h-14 items-center gap-3 px-4 ${isCurrent ? 'bg-primary-tint text-primary' : 'hover:bg-surface-2'}`}
                >
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {isCurrent && <Check size={18} aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/projects"
          onClick={() => setOpen(false)}
          className="mt-4 flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary-tint"
        >
          <LayoutGrid size={18} aria-hidden /> All projects
        </Link>
      </Sheet>
    </>
  );
}
