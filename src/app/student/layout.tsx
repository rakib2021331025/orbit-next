import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireStudent } from "@/lib/guards";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  const session = await requireStudent();
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
