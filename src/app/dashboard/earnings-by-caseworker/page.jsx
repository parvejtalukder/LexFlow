import DashboardShell from '@/components/dashboard/admin/Admin';
import EarningsByCaseworker from '@/components/dashboard/admin/EarningsByCaseworker';

export default function EarningsByCaseworkerPage() {
  return (
    <DashboardShell>
      <EarningsByCaseworker />
    </DashboardShell>
  );
}