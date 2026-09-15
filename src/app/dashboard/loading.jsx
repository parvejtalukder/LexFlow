import DashboardSkeleton from '@/templates/loader/DashboardSkeleton';

// Route-level loading UI: instant skeleton while the dashboard shell and its
// charts stream in on first navigation.
export default function Loading() {
  return <DashboardSkeleton />;
}
