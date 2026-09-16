import DashboardShell from '@/components/dashboard/admin/Admin';
import ActivityHistory from '@/components/dashboard/wallet/ActivityHistory';

export default function ActivityHistoryPage() {
  return (
    <DashboardShell>
      <ActivityHistory />
    </DashboardShell>
  );
}