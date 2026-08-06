import type { Metadata } from "next";
import { Video } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireStudentProfileId } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function StudentLiveClassesPage() {
  const studentId = await requireStudentProfileId();

  // Scoped to the student's own enrolments — never to a client-supplied id.
  const enrolments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { batchId: true },
  });
  const batchIds = enrolments.map((e) => e.batchId);

  const classes = batchIds.length
    ? await prisma.liveClass.findMany({
        where: { batchId: { in: batchIds }, status: "PUBLISHED" },
        orderBy: { scheduledAt: "asc" },
        include: {
          batch: { include: { course: { select: { name: true } } } },
          subject: { select: { name: true } },
          teacher: { select: { fullName: true } },
        },
      })
    : [];

  const now = new Date();
  const upcoming = classes.filter(
    (c) => new Date(c.scheduledAt).getTime() + c.durationMinutes * 60_000 >= now.getTime(),
  );
  const past = classes
    .filter(
      (c) => new Date(c.scheduledAt).getTime() + c.durationMinutes * 60_000 < now.getTime(),
    )
    .reverse();

  return (
    <>
      <PageHeader
        title="Live Classes"
        description="Join your scheduled online classes."
      />

      {upcoming.length === 0 && past.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
            <div className="bg-muted flex size-12 items-center justify-center rounded-full">
              <Video className="size-6" />
            </div>
            <div>
              <p className="text-foreground font-medium">No live classes yet</p>
              <p className="text-sm">
                Your teachers will schedule sessions here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium">Upcoming</h2>
              <div className="grid gap-3">
                {upcoming.map((item) => {
                  const start = new Date(item.scheduledAt);
                  const end = new Date(start.getTime() + item.durationMinutes * 60_000);
                  const isLive = now >= start && now <= end;

                  return (
                    <Card key={item.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{item.title}</p>
                            {isLive && (
                              <Badge className="gap-1.5 bg-red-500 hover:bg-red-500">
                                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                                Live now
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-1 truncate text-sm">
                            {item.batch.course.name}
                            {item.subject && ` · ${item.subject.name}`}
                            {item.teacher && ` · ${item.teacher.fullName}`}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                            {formatDate(start, "datetime")} · {item.durationMinutes} min
                          </p>
                        </div>

                        <Button asChild variant={isLive ? "default" : "outline"}>
                          <a
                            href={item.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Video className="size-4" />
                            {isLive ? "Join now" : "Join"}
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-muted-foreground mb-3 text-sm font-medium">Past</h2>
              <div className="grid gap-2">
                {past.slice(0, 20).map((item) => (
                  <Card key={item.id} className="opacity-70">
                    <CardContent className="flex items-center justify-between gap-4 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {item.batch.course.name}
                          {item.teacher && ` · ${item.teacher.fullName}`}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDate(item.scheduledAt, "datetime")}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
