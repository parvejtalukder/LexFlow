import DashboardShell from '@/components/dashboard/admin/Admin';
import CaseDetail from '@/components/dashboard/CaseDetail';

export default async function CaseDetailPage({ params }) {
  const { id } = await params;

  return (
    <DashboardShell>
      <CaseDetail id={id} />
    </DashboardShell>
  );
}