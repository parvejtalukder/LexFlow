import DashboardShell from '@/components/dashboard/admin/Admin';

export default function SectionPage() {
  return (
    <DashboardShell>
      <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-16 shadow-sm">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Under Construction
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            This section is under construction.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}