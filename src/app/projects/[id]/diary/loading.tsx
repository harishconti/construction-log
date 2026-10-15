import { SkeletonRows } from '@/components/ui/Skeleton';

// Mirrors the Site diary header so the swap to real entries does not jump.
export default function DiaryLoading() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold lg:text-[28px]">Site diary</h1>
      <SkeletonRows rows={3} label="Loading diary" />
    </div>
  );
}
