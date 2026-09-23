import DashboardShell from '@/components/dashboard/admin/Admin';
import AdminComplaints from '@/components/dashboard/admin/Complaints';

export default function ComplaintsPage() {
  return (
    <DashboardShell>
      <AdminComplaints />
    </DashboardShell>
  );
}
