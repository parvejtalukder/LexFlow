import DashboardShell from '@/components/dashboard/admin/Admin';
import CaseEdit from '@/components/dashboard/CaseEdit';

export default async function CaseEditPage({ params }) {
  const { id } = await params;

  return (
    <DashboardShell>
      <CaseEdit id={id} />
    </DashboardShell>
  );
}