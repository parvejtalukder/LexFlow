import DashboardShell from '@/components/dashboard/admin/Admin';
import Payments from '@/components/dashboard/Payments';

export default function MyPaymentsPage() {
  return (
    <DashboardShell>
      <Payments />
    </DashboardShell>
  );
}