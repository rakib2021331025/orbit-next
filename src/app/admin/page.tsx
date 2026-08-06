import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  ClipboardList,
  CreditCard,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, monthKey } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

// Always render fresh — these are live operational counters.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisMonth = monthKey(today);

  const [
    totalStudents,
    activeStudents,
    totalTeachers,
    pendingAdmissions,
    todayAttendance,
    monthCollection,
    outstanding,
    upcomingLiveClasses,
    recentAdmissions,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { status: "ACTIVE" } }),
    prisma.teacher.count({ where: { status: "ACTIVE" } }),
    prisma.admission.count({ where: { status: "PENDING" } }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { session: { date: startOfToday } },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { paymentMonth: thisMonth, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: { in: ["UNPAID", "PARTIAL"] } },
      _sum: { dueAmount: true, amount: true },
    }),
    prisma.liveClass.findMany({
      where: { scheduledAt: { gte: new Date() }, status: "PUBLISHED" },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      include: {
        batch: { include: { course: { select: { name: true } } } },
        teacher: { select: { fullName: true } },
      },
    }),
    prisma.admission.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const presentToday =
    todayAttendance.find((row) => row.status === "PRESENT")?._count._all ?? 0;
  const absentToday =
    todayAttendance.find((row) => row.status === "ABSENT")?._count._all ?? 0;
  const markedToday = todayAttendance.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A live view of admissions, attendance and collections."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Students"
          value={totalStudents}
          hint={`${activeStudents} active`}
          icon={Users}
        />
        <StatCard
          label="Teachers"
          value={totalTeachers}
          hint="Currently active"
          icon={Users}
        />
        <StatCard
          label="Present today"
          value={markedToday === 0 ? "—" : `${presentToday}/${markedToday}`}
          hint={markedToday === 0 ? "Attendance not taken yet" : `${absentToday} absent`}
          icon={CalendarCheck}
          tone={markedToday === 0 ? "default" : absentToday > presentToday ? "critical" : "positive"}
        />
        <StatCard
          label="Pending admissions"
          value={pendingAdmissions}
          hint="Awaiting review"
          icon={ClipboardList}
          tone={pendingAdmissions > 0 ? "warning" : "default"}
        />
        <StatCard
          label={`Collected (${thisMonth})`}
          value={formatCurrency(monthCollection._sum.amount)}
          icon={TrendingUp}
          tone="positive"
        />
        <StatCard
          label="Outstanding dues"
          value={formatCurrency(outstanding._sum.dueAmount)}
          hint="Across unpaid and partial payments"
          icon={CreditCard}
          tone={Number(outstanding._sum.dueAmount ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Upcoming live classes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/live-classes">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingLiveClasses.length === 0 ? (
              <EmptyRow
                icon={<Video className="size-5" />}
                message="No live classes scheduled."
                actionHref="/admin/live-classes"
                actionLabel="Schedule one"
              />
            ) : (
              <ul className="divide-y">
                {upcomingLiveClasses.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {item.batch.course.name} · {item.batch.name}
                        {item.teacher && ` · ${item.teacher.fullName}`}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {formatDate(item.scheduledAt, "datetime")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Pending admissions</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/admissions">Review</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentAdmissions.length === 0 ? (
              <EmptyRow
                icon={<ClipboardList className="size-5" />}
                message="No applications waiting."
              />
            ) : (
              <ul className="divide-y">
                {recentAdmissions.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.fullName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {item.courseLabel ?? "No course specified"} · {item.mobile}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDate(item.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EmptyRow({
  icon,
  message,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
      <div className="bg-muted flex size-10 items-center justify-center rounded-full">
        {icon}
      </div>
      <p className="text-sm">{message}</p>
      {actionHref && actionLabel && (
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
