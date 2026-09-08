import DashboardShell from '@/components/dashboard/admin/Admin';
import DashboardOverview from '@/components/dashboard/admin/Overview';

export default function DashboardPage() {
  return (
    <DashboardShell>
      <DashboardOverview />
    </DashboardShell>
  );
}