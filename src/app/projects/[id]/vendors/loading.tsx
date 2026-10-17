import { SkeletonRows } from '@/components/ui/Skeleton';

// Mirrors the Vendors header + list so the swap to real data does not jump.
export default function VendorsLoading() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold lg:text-[28px]">Vendors</h1>
      <SkeletonRows leading trailing label="Loading vendors" />
    </div>
  );
}
