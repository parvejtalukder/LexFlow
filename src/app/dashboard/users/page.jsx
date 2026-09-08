import DashboardShell from '@/components/dashboard/admin/Admin';
import AdminUsers from '@/components/dashboard/admin/Users';

export default function UsersPage() {
  return (
    <DashboardShell>
      <AdminUsers />
    </DashboardShell>
  );
}