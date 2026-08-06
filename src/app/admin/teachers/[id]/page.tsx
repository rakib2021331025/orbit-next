import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Star } from "lucide-react";

import { AssignmentManager } from "./assignment-manager";
import { DangerZone } from "./danger-zone";
import { TeacherFormDialog } from "../teacher-form-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/admin/teachers/[id]">): Promise<Metadata> {
  const { id } = await params;
  const teacher = await prisma.teacher.findUnique({
    where: { id },
    select: { fullName: true },
  });
  return { title: teacher?.fullName ?? "Teacher" };
}

export default async function TeacherDetailPage({
  params,
}: PageProps<"/admin/teachers/[id]">) {
  const { id } = await params;

  const [teacher, batches, subjects, ratingAgg] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, lastLoginAt: true } },
        assignments: {
          include: {
            batch: { include: { course: { select: { name: true } } } },
            subject: { select: { name: true } },
          },
          orderBy: { assignedAt: "desc" },
        },
        _count: { select: { liveClasses: true, exams: true, cqExams: true } },
      },
    }),
    prisma.batch.findMany({
      where: { isActive: true },
      include: { course: { select: { name: true } } },
      orderBy: [{ course: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.subject.findMany({
      include: { course: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.teacherEvaluation.aggregate({
      where: { teacherId: id },
      _avg: { averageRating: true },
      _count: { _all: true },
    }),
  ]);

  if (!teacher) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link href="/admin/teachers">
          <ArrowLeft className="size-4" />
          All teachers
        </Link>
      </Button>

      <PageHeader
        title={teacher.fullName}
        description={teacher.designation ?? "Teacher"}
        action={
          <TeacherFormDialog
            mode="edit"
            teacher={{
              id: teacher.id,
              fullName: teacher.fullName,
              email: teacher.user.email,
              phone: teacher.phone,
              employeeId: teacher.employeeId,
              designation: teacher.designation,
              qualification: teacher.qualification,
              specialization: teacher.specialization,
              bio: teacher.bio,
              joiningDate: teacher.joiningDate,
              status: teacher.status,
            }}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <Avatar className="size-20">
                {teacher.photoUrl && <AvatarImage src={teacher.photoUrl} alt="" />}
                <AvatarFallback className="text-lg">
                  {teacher.fullName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{teacher.fullName}</p>
                <Badge variant={teacher.status === "ACTIVE" ? "default" : "secondary"}>
                  {teacher.status === "ON_LEAVE" ? "On leave" : teacher.status.toLowerCase()}
                </Badge>
              </div>

              <dl className="text-muted-foreground w-full space-y-2 pt-2 text-left text-sm">
                <InfoRow icon={<Mail className="size-4" />} value={teacher.user.email} />
                <InfoRow icon={<Phone className="size-4" />} value={teacher.phone} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Employee ID" value={teacher.employeeId} />
              <DetailRow label="Qualification" value={teacher.qualification} />
              <DetailRow label="Specialisation" value={teacher.specialization} />
              <DetailRow label="Joined" value={formatDate(teacher.joiningDate)} />
              <DetailRow
                label="Last sign-in"
                value={
                  teacher.user.lastLoginAt
                    ? formatDate(teacher.user.lastLoginAt, "datetime")
                    : "Never"
                }
              />
              {teacher.bio && (
                <div className="border-t pt-3">
                  <p className="text-muted-foreground">{teacher.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Average rating"
              value={
                ratingAgg._count._all === 0
                  ? "—"
                  : (ratingAgg._avg.averageRating ?? 0).toFixed(2)
              }
              hint={`${ratingAgg._count._all} evaluation(s)`}
              icon={Star}
              tone={
                (ratingAgg._avg.averageRating ?? 0) >= 4
                  ? "positive"
                  : ratingAgg._count._all === 0
                    ? "default"
                    : "warning"
              }
            />
            <StatCard
              label="Live classes"
              value={teacher._count.liveClasses}
              icon={Star}
            />
            <StatCard
              label="Exams created"
              value={teacher._count.exams + teacher._count.cqExams}
              hint="MCQ and CQ combined"
              icon={Star}
            />
          </div>

          <AssignmentManager
            teacherId={teacher.id}
            assignments={teacher.assignments.map((a) => ({
              id: a.id,
              batchLabel: `${a.batch.course.name} · ${a.batch.name}`,
              subjectName: a.subject?.name ?? null,
            }))}
            batches={batches.map((b) => ({
              id: b.id,
              label: `${b.course.name} · ${b.name}`,
            }))}
            subjects={subjects.map((s) => ({
              id: s.id,
              label: `${s.name} (${s.course.name})`,
            }))}
          />

          <DangerZone teacherId={teacher.id} teacherName={teacher.fullName} />
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon, value }: { icon: React.ReactNode; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="truncate">{value}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="truncate text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}
