import { Skeleton } from '@/components/ui/skeleton';

interface BlockListSkeletonProps {
  rows?: number;
}

export function BlockListSkeleton({ rows = 4 }: BlockListSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="読み込み中">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
            <Skeleton className="ml-auto h-4 w-12" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
