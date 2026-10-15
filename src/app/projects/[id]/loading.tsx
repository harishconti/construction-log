import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';

// Shown instantly when switching tabs inside a project (the shell stays put), until the server
// render arrives. Pages with a distinct layout have their own loading.tsx next to them.
export default function ProjectSectionLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <SkeletonRows rows={4} label="Loading" />
    </div>
  );
}
