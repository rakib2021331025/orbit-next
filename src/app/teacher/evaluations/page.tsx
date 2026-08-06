import type { Metadata } from "next";
import { MessageSquare, Star, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireTeacherProfileId } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { EVALUATION_CRITERIA } from "@/lib/validation";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "My Evaluations" };
export const dynamic = "force-dynamic";

export default async function TeacherEvaluationsPage() {
  const teacherId = await requireTeacherProfileId();

  const [aggregate, evaluations] = await Promise.all([
    prisma.teacherEvaluation.aggregate({
      where: { teacherId },
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
    prisma.teacherEvaluation.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      take: 50,
      // `student` is deliberately NOT selected here: a teacher must never be
      // able to attribute feedback, anonymous or not.
      select: {
        id: true,
        averageRating: true,
        comment: true,
        isAnonymous: true,
        createdAt: true,
        batch: { select: { name: true, course: { select: { name: true } } } },
      },
    }),
  ]);

  const total = aggregate._count._all;
  const withComments = evaluations.filter((e) => e.comment);

  return (
    <>
      <PageHeader
        title="My evaluations"
        description="Aggregated student feedback. Individual responses are always shown without student names."
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
                Feedback appears here once your students submit ratings.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Overall rating"
              value={(aggregate._avg.averageRating ?? 0).toFixed(2)}
              hint="Out of 5.00"
              icon={Star}
              tone={(aggregate._avg.averageRating ?? 0) >= 4 ? "positive" : "warning"}
            />
            <StatCard label="Responses" value={total} icon={TrendingUp} />
            <StatCard
              label="Written comments"
              value={withComments.length}
              icon={MessageSquare}
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Breakdown by criterion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {EVALUATION_CRITERIA.map((criterion) => {
                  const score = aggregate._avg[criterion.key] ?? 0;
                  return (
                    <div key={criterion.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span>{criterion.label}</span>
                        <span className="font-medium tabular-nums">
                          {score.toFixed(2)}
                        </span>
                      </div>
                      <Progress value={(score / 5) * 100} />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent feedback</CardTitle>
              </CardHeader>
              <CardContent>
                {withComments.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No written comments yet.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {withComments.slice(0, 10).map((evaluation) => (
                      <li key={evaluation.id} className="space-y-1 border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-amber-500">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                className={
                                  i < Math.round(evaluation.averageRating)
                                    ? "size-3.5 fill-current"
                                    : "text-muted-foreground/30 size-3.5 fill-current"
                                }
                              />
                            ))}
                          </div>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatDate(evaluation.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm">{evaluation.comment}</p>
                        <p className="text-muted-foreground text-xs">
                          {evaluation.batch
                            ? `${evaluation.batch.course.name} · ${evaluation.batch.name}`
                            : "Unspecified batch"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
