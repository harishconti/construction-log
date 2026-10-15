import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';

// Mirrors the Expenses header + list so the swap to real data does not jump.
export default function ExpensesLoading() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold lg:text-[28px]">Expenses</h1>
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-28" />
      </div>
      <SkeletonRows leading trailing label="Loading expenses" />
    </div>
  );
}
