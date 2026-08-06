import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarCheck, Star, Users, Video } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTeacher } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const session = await requireTeacher();
  const teacherId = session.user.profileId;

  if (!teacherId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">No teacher profile linked</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ask an administrator to link your account to a teacher profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [assignments, upcomingClasses, ratingAgg, examCount, recentSessions] =
    await Promise.all([
      prisma.teacherAssignment.findMany({
        where: { teacherId },
        include: {
          batch: {
            include: {
              course: { select: { name: true } },
              _count: { select: { enrollments: true } },
            },
          },
          subject: { select: { name: true } },
        },
      }),
      prisma.liveClass.findMany({
        where: { teacherId, scheduledAt: { gte: new Date() }, status: "PUBLISHED" },
        orderBy: { scheduledAt: "asc" },
        take: 5,
        include: { batch: { include: { course: { select: { name: true } } } } },
      }),
      prisma.teacherEvaluation.aggregate({
        where: { teacherId },
        _avg: { averageRating: true },
        _count: { _all: true },
      }),
      prisma.exam.count({ where: { teacherId } }),
      prisma.attendanceSession.findMany({
        where: { teacherId },
        orderBy: { date: "desc" },
        take: 5,
        include: {
          batch: { include: { course: { select: { name: true } } } },
          _count: { select: { records: true } },
        },
      }),
    ]);

  // A teacher may be assigned to the same batch for several subjects; count
  // distinct batches so the tile reflects classes, not assignment rows.
  const distinctBatches = new Set(assignments.map((a) => a.batchId));
  const totalStudents = [...distinctBatches].reduce((sum, batchId) => {
    const assignment = assignments.find((a) => a.batchId === batchId);
    return sum + (assignment?.batch._count.enrollments ?? 0);
  }, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session.user.name ?? "Teacher"}`}
        description="Your classes, schedule and student feedback at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Batches" value={distinctBatches.size} icon={BookOpen} />
        <StatCard
          label="Students"
          value={totalStudents}
          hint="Across your batches"
          icon={Users}
        />
        <StatCard label="Exams created" value={examCount} icon={CalendarCheck} />
        <StatCard
          label="Average rating"
          value={
            ratingAgg._count._all === 0
              ? "—"
              : (ratingAgg._avg.averageRating ?? 0).toFixed(2)
          }
          hint={`${ratingAgg._count._all} evaluation(s)`}
          icon={Star}
          tone={(ratingAgg._avg.averageRating ?? 0) >= 4 ? "positive" : "default"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Upcoming live classes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/teacher/live-classes">Manage</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingClasses.length === 0 ? (
              <Empty icon={<Video className="size-5" />} message="Nothing scheduled." />
            ) : (
              <ul className="divide-y">
                {upcomingClasses.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {item.batch.course.name} · {item.batch.name}
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
            <CardTitle className="text-base">Recent attendance</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/teacher/attendance">Take attendance</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <Empty
                icon={<CalendarCheck className="size-5" />}
                message="You haven't taken attendance yet."
              />
            ) : (
              <ul className="divide-y">
                {recentSessions.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {session.batch.course.name} · {session.batch.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {session._count.records} student(s) marked
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDate(session.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">My batches</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <Empty
              icon={<BookOpen className="size-5" />}
              message="No batches assigned yet. An administrator will assign them to you."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded-lg border p-4">
                  <p className="truncate font-medium">{assignment.batch.course.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {assignment.batch.name} · {assignment.subject?.name ?? "All subjects"}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {assignment.batch._count.enrollments} student(s)
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Empty({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
      <div className="bg-muted flex size-10 items-center justify-center rounded-full">
        {icon}
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
