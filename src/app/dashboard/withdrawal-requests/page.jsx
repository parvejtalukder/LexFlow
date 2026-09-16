import DashboardShell from '@/components/dashboard/admin/Admin';
import WithdrawalRequests from '@/components/dashboard/admin/WithdrawalRequests';

export default function WithdrawalRequestsPage() {
  return (
    <DashboardShell>
      <WithdrawalRequests />
    </DashboardShell>
  );
}