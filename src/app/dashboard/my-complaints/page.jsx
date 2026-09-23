import DashboardShell from '@/components/dashboard/admin/Admin';
import MyComplaints from '@/components/dashboard/complaints/MyComplaints';

export default function MyComplaintsPage() {
  return (
    <DashboardShell>
      <MyComplaints />
    </DashboardShell>
  );
}
