import type { Metadata } from "next";

import { LiveClassDialog } from "@/components/live-class/live-class-dialog";
import { LiveClassList } from "@/components/live-class/live-class-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireTeacherProfileId } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function TeacherLiveClassesPage() {
  const teacherId = await requireTeacherProfileId();

  // A teacher only ever sees, and can only schedule for, their assigned batches.
  const assignments = await prisma.teacherAssignment.findMany({
    where: { teacherId },
    include: { batch: { include: { course: { select: { name: true } } } } },
  });

  const batchIds = [...new Set(assignments.map((a) => a.batchId))];

  if (batchIds.length === 0) {
    return (
      <>
        <PageHeader title="Live Classes" />
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center">
            <p className="text-foreground font-medium">No batches assigned</p>
            <p className="mt-1 text-sm">
              An administrator needs to assign you to a batch before you can
              schedule live classes.
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const [classes, subjects] = await Promise.all([
    prisma.liveClass.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: { scheduledAt: "desc" },
      include: {
        batch: { include: { course: { select: { name: true } } } },
        subject: { select: { name: true } },
        teacher: { select: { fullName: true } },
      },
    }),
    prisma.subject.findMany({
      where: { course: { batches: { some: { id: { in: batchIds } } } } },
      include: { course: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const batchOptions = [
    ...new Map(
      assignments.map((a) => [
        a.batchId,
        { id: a.batchId, label: `${a.batch.course.name} · ${a.batch.name}` },
      ]),
    ).values(),
  ];
  const subjectOptions = subjects.map((s) => ({
    id: s.id,
    label: `${s.name} (${s.course.name})`,
  }));

  return (
    <>
      <PageHeader
        title="Live Classes"
        description="Schedule Google Meet sessions for the batches you teach."
        action={
          <LiveClassDialog
            mode="create"
            batches={batchOptions}
            subjects={subjectOptions}
          />
        }
      />

      <LiveClassList
        items={classes.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          meetingLink: c.meetingLink,
          batchId: c.batchId,
          subjectId: c.subjectId,
          teacherId: c.teacherId,
          scheduledAt: c.scheduledAt,
          durationMinutes: c.durationMinutes,
          status: c.status,
          batchLabel: `${c.batch.course.name} · ${c.batch.name}`,
          subjectName: c.subject?.name ?? null,
          teacherName: c.teacher?.fullName ?? null,
        }))}
        batches={batchOptions}
        subjects={subjectOptions}
      />
    </>
  );
}
