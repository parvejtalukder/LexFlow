import { Skeleton } from "@/components/ui/Skeleton";
import ChartSkeleton from "@/components/ui/ChartSkeleton";

// Skeleton version of the Admin dashboard layout (sidebar + header + stats + content).
const DashboardSkeleton = () => {
  return (
    <div className="flex min-h-screen w-full">
      <div className="flex w-full bg-gray-50 dark:bg-gray-950">
        {/* --- Sidebar skeleton --- */}
        <aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2 shadow-sm">
          {/* Logo + name */}
          <div className="mb-6 border-b border-gray-200 dark:border-gray-800 pb-4">
            <div className="flex items-center gap-3 p-2">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>

          {/* Main nav items */}
          <div className="mb-8 space-y-1">
            <Skeleton className="mb-3 h-3 w-24" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex h-11 items-center gap-3 rounded-md px-3">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>

          {/* Account group */}
          <div className="space-y-1 border-t border-gray-200 dark:border-gray-800 pt-4">
            <Skeleton className="mb-3 h-3 w-16" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-11 items-center gap-3 rounded-md px-3">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </aside>

        {/* --- Content skeleton --- */}
        <div className="flex-1 overflow-auto p-6">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="size-10 rounded-lg" />
            </div>
          </div>

          {/* Stats grid */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <Skeleton className="size-10 rounded-lg" />
                  <Skeleton className="size-4" />
                </div>
                <Skeleton className="mb-2 h-4 w-20" />
                <Skeleton className="mb-2 h-7 w-28" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          </div>

          {/* Trend + primary breakdown — mirrors the dashboard's first chart row */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm lg:col-span-2">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-56" />
                </div>
                <Skeleton className="size-7 rounded-lg" />
              </div>
              <ChartSkeleton variant="area" height={260} />
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
              <div className="mb-6 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-40" />
              </div>
              <ChartSkeleton variant="donut" height={260} />
            </div>
          </div>

          {/* Breakdown row — three chart cards like the lower dashboard grid */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm"
              >
                <div className="mb-6 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3.5 w-44" />
                </div>
                <ChartSkeleton variant={i === 0 ? "donut" : "bars"} height={200} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeleton;