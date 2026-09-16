import DashboardShell from '@/components/dashboard/admin/Admin';
import EarningsByCase from '@/components/dashboard/wallet/EarningsByCase';

export default function EarningsByCasePage() {
  return (
    <DashboardShell>
      <EarningsByCase />
    </DashboardShell>
  );
}