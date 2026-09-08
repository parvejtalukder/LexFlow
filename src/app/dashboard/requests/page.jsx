import DashboardShell from '@/components/dashboard/admin/Admin';
import AdminApplications from '@/components/dashboard/admin/Applications';

export default function RequestsPage() {
  return (
    <DashboardShell>
      <AdminApplications />
    </DashboardShell>
  );
}