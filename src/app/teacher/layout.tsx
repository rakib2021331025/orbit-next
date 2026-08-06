import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireTeacher } from "@/lib/guards";

export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const session = await requireTeacher();
  return <DashboardShell session={session}>{children}</DashboardShell>;
}
