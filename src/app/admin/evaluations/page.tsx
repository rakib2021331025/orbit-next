import type { Metadata } from "next";
import Link from "next/link";
import { Medal, MessageSquare, Star, Users } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { EVALUATION_CRITERIA } from "@/lib/validation";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Teacher Evaluation" };
export const dynamic = "force-dynamic";

export default async function AdminEvaluationsPage() {
  const [overall, byTeacher, teachers, recent, monthlyRaw] = await Promise.all([
    prisma.teacherEvaluation.aggregate({
      _avg: {
        averageRating: true,
        teachingQuality: true,
        explanationClarity: true,
        classManagement: true,
        timeManagement: true,
        communicationSkills: true,
        courseDelivery: true,
        studentSatisfaction: true,
      },
      _count: { _all: true },
    }),
    prisma.teacherEvaluation.groupBy({
      by: ["teacherId"],
      _avg: { averageRating: true },
      _count: { _all: true },
    }),
    prisma.teacher.findMany({
      select: { id: true, fullName: true, photoUrl: true, designation: true },
    }),
    prisma.teacherEvaluation.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        teacher: { select: { fullName: true } },
        // Admins see the student's name even on anonymous submissions — this is
        // the moderation path, and the student is told so on the form.
        student: { select: { fullName: true } },
        batch: { select: { name: true, course: { select: { name: true } } } },
      },
    }),
    // Six-month trend. Raw SQL because Prisma's groupBy cannot bucket by month.
    prisma.$queryRaw<Array<{ month: string; avg: number; count: bigint }>>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             AVG("averageRating")::float8 AS avg,
             COUNT(*) AS count
      FROM teacher_evaluations
      WHERE "createdAt" >= now() - interval '6 months'
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));

  const ranking = byTeacher
    .map((row) => ({
      teacher: teacherMap.get(row.teacherId),
      average: row._avg.averageRating ?? 0,
      count: row._count._all,
    }))
    .filter((row) => row.teacher)
    .sort((a, b) => b.average - a.average);

  const total = overall._count._all;
  const monthly = monthlyRaw.map((row) => ({
    month: row.month,
    avg: row.avg,
    count: Number(row.count),
  }));

  return (
    <>
      <PageHeader
        title="Teacher evaluation"
        description="Aggregate teaching quality across all teachers, with rankings and trends."
      />

      {total === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <Star className="size-6" />
            </div>
            <div>
              <p className="text-foreground font-medium">No evaluations yet</p>
              <p className="text-sm">
                Students can rate teachers from their own dashboard once they are
                enrolled in a batch with an assigned teacher.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Institution average"
              value={(overall._avg.averageRating ?? 0).toFixed(2)}
              hint="Out of 5.00"
              icon={Star}
              tone={(overall._avg.averageRating ?? 0) >= 4 ? "positive" : "warning"}
            />
            <StatCard label="Total responses" value={total} icon={MessageSquare} />
            <StatCard label="Teachers rated" value={ranking.length} icon={Users} />
            <StatCard
              label="Top rated"
              value={ranking[0]?.average.toFixed(2) ?? "—"}
              hint={ranking[0]?.teacher?.fullName ?? undefined}
              icon={Medal}
              tone="positive"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Institution-wide criteria</CardTitle>
                <CardDescription>Averaged across every evaluation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {EVALUATION_CRITERIA.map((criterion) => {
                  const score = overall._avg[criterion.key] ?? 0;
                  return (
                    <div key={criterion.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>{criterion.label}</span>
                        <span className="font-medium tabular-nums">{score.toFixed(2)}</span>
                      </div>
                      <Progress value={(score / 5) * 100} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly trend</CardTitle>
                <CardDescription>Average rating over the last six months.</CardDescription>
              </CardHeader>
              <CardContent>
                {monthly.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    Not enough data yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {monthly.map((row) => (
                      <div key={row.month} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="tabular-nums">{row.month}</span>
                          <span className="text-muted-foreground">
                            <span className="text-foreground font-medium tabular-nums">
                              {row.avg.toFixed(2)}
                            </span>{" "}
                            · {row.count} response{row.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <Progress value={(row.avg / 5) * 100} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Teacher ranking</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-center">Responses</TableHead>
                    <TableHead className="w-48">Average</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((row, index) => (
                    <TableRow key={row.teacher!.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/teachers/${row.teacher!.id}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <Avatar className="size-8">
                            {row.teacher!.photoUrl && (
                              <AvatarImage src={row.teacher!.photoUrl} alt="" />
                            )}
                            <AvatarFallback>
                              {row.teacher!.fullName.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.teacher!.fullName}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {row.teacher!.designation ?? "Teacher"}
                            </p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress value={(row.average / 5) * 100} className="flex-1" />
                          <span className="w-10 text-right text-sm font-medium tabular-nums">
                            {row.average.toFixed(2)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Recent responses</CardTitle>
              <CardDescription>
                Student names are visible to administrators for moderation, including
                on evaluations the student marked anonymous.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {recent.map((evaluation) => (
                  <li key={evaluation.id} className="space-y-1 border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {evaluation.teacher.fullName}
                        </span>
                        <Badge variant="secondary" className="gap-1">
                          <Star className="size-3 fill-current" />
                          {evaluation.averageRating.toFixed(1)}
                        </Badge>
                        {evaluation.isAnonymous && (
                          <Badge variant="outline">Anonymous</Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatDate(evaluation.createdAt)}
                      </span>
                    </div>
                    {evaluation.comment && (
                      <p className="text-sm">{evaluation.comment}</p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      by {evaluation.student.fullName}
                      {evaluation.batch &&
                        ` · ${evaluation.batch.course.name} · ${evaluation.batch.name}`}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
