import type { Metadata } from "next";
import { Star } from "lucide-react";

import { EvaluationDialog } from "./evaluation-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentProfileId } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Rate Teachers" };
export const dynamic = "force-dynamic";

export default async function StudentEvaluationsPage() {
  const studentId = await requireStudentProfileId();

  const [assignments, submitted] = await Promise.all([
    // Every teacher who teaches a batch this student is enrolled in.
    prisma.teacherAssignment.findMany({
      where: { batch: { enrollments: { some: { studentId } } } },
      include: {
        teacher: { select: { id: true, fullName: true, photoUrl: true, designation: true } },
        batch: { include: { course: { select: { name: true } } } },
      },
    }),
    prisma.teacherEvaluation.findMany({
      where: { studentId },
      select: { teacherId: true, batchId: true, averageRating: true, updatedAt: true },
    }),
  ]);

  // One card per (teacher, batch) pair, de-duplicated across subjects.
  const pairs = [
    ...new Map(
      assignments.map((a) => [
        `${a.teacherId}::${a.batchId}`,
        {
          teacher: a.teacher,
          batchId: a.batchId,
          batchLabel: `${a.batch.course.name} · ${a.batch.name}`,
        },
      ]),
    ).values(),
  ];

  const existing = new Map(
    submitted.map((e) => [`${e.teacherId}::${e.batchId}`, e]),
  );

  return (
    <>
      <PageHeader
        title="Rate your teachers"
        description="Your feedback helps improve teaching quality. You can choose to submit anonymously, and you may revise a rating later."
      />

      {pairs.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <Star className="size-6" />
            </div>
            <div>
              <p className="text-foreground font-medium">Nothing to rate yet</p>
              <p className="text-sm">
                Once teachers are assigned to your batch, they will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pairs.map((pair) => {
            const previous = existing.get(`${pair.teacher.id}::${pair.batchId}`);

            return (
              <Card key={`${pair.teacher.id}-${pair.batchId}`}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-11">
                      {pair.teacher.photoUrl && (
                        <AvatarImage src={pair.teacher.photoUrl} alt="" />
                      )}
                      <AvatarFallback>
                        {pair.teacher.fullName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{pair.teacher.fullName}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {pair.teacher.designation ?? "Teacher"}
                      </p>
                    </div>
                  </div>

                  <p className="text-muted-foreground truncate text-sm">
                    {pair.batchLabel}
                  </p>

                  {previous && (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Star className="size-3 fill-current" />
                        {previous.averageRating.toFixed(1)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        rated {formatDate(previous.updatedAt)}
                      </span>
                    </div>
                  )}

                  <EvaluationDialog
                    teacherId={pair.teacher.id}
                    teacherName={pair.teacher.fullName}
                    batchId={pair.batchId}
                    batchLabel={pair.batchLabel}
                    hasSubmitted={Boolean(previous)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
