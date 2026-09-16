import DashboardShell from '@/components/dashboard/admin/Admin';
import UserDetail from '@/components/dashboard/admin/UserDetail';

export default async function UserDetailPage({ params }) {
  const { uid } = await params;

  return (
    <DashboardShell>
      <UserDetail uid={uid} />
    </DashboardShell>
  );
}