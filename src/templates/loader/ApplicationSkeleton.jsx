import { Skeleton } from "@/components/ui/Skeleton";

// Skeleton version of the Caseworker application page (navbar + form card).
const ApplicationSkeleton = () => {
  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC] font-sans dark:bg-gray-950">
      {/* Sticky Top Navbar skeleton */}
      <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-slate-800 bg-[#080B1A] px-6 py-4 shadow-md md:px-12">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 shrink-0 rounded-lg bg-slate-700" />
          <Skeleton className="h-5 w-24 bg-slate-700" />
          <Skeleton className="ml-3 hidden h-5 w-32 rounded-full bg-slate-700 sm:block" />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden space-y-1.5 text-right sm:block">
            <Skeleton className="ml-auto h-3 w-24 bg-slate-700" />
            <Skeleton className="ml-auto h-3 w-32 bg-slate-700" />
          </div>
          <Skeleton className="size-8 rounded-full bg-slate-700" />
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 w-full text-center">
          <Skeleton className="mx-auto mb-2 h-8 w-72 max-w-full" />
          <Skeleton className="mx-auto h-4 w-56 max-w-full" />
        </div>

        {/* Stepper skeleton */}
        <div className="mb-8 flex w-full items-center justify-between">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              {i < 2 && <Skeleton className="mx-2 h-0.5 flex-1 rounded-full" />}
            </div>
          ))}
        </div>

        {/* Form card skeleton */}
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-1.5 h-3 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
            <div>
              <Skeleton className="mb-1.5 h-3 w-32" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          </div>

          {/* Footer buttons skeleton */}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <Skeleton className="h-9 w-full rounded-xl sm:w-24" />
            <Skeleton className="h-9 w-full rounded-xl sm:w-40" />
          </div>
        </div>
      </main>
    </div>
  );
};

export default ApplicationSkeleton;