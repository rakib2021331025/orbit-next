import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAdmin } from "@/lib/guards";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
