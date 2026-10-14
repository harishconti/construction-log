'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden />;
}

/** List-row skeletons: optional leading tile, two text lines, optional trailing value. */
export function SkeletonRows({
  rows = 5,
  leading = false,
  trailing = false,
  label = 'Loading',
}: {
  rows?: number;
  leading?: boolean;
  trailing?: boolean;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label}>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 p-3">
            {leading && <Skeleton className="h-11 w-11 shrink-0" />}
            <div className="flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
            {trailing && <Skeleton className="h-4 w-16" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
