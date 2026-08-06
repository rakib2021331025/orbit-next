import type { Metadata } from "next";

import { LiveClassDialog } from "@/components/live-class/live-class-dialog";
import { LiveClassList } from "@/components/live-class/live-class-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function AdminLiveClassesPage() {
  const [classes, batches, subjects, teachers] = await Promise.all([
    prisma.liveClass.findMany({
      orderBy: { scheduledAt: "desc" },
      include: {
        batch: { include: { course: { select: { name: true } } } },
        subject: { select: { name: true } },
        teacher: { select: { fullName: true } },
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
    prisma.teacher.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const batchOptions = batches.map((b) => ({
    id: b.id,
    label: `${b.course.name} · ${b.name}`,
  }));
  const subjectOptions = subjects.map((s) => ({
    id: s.id,
    label: `${s.name} (${s.course.name})`,
  }));
  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.fullName }));

  return (
    <>
      <PageHeader
        title="Live Classes"
        description="Schedule Google Meet sessions. Students in the batch can join from their dashboard."
        action={
          <LiveClassDialog
            mode="create"
            batches={batchOptions}
            subjects={subjectOptions}
            teachers={teacherOptions}
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
        teachers={teacherOptions}
      />
    </>
  );
}
