"use client";

import { useActionState } from "react";
import { Trash2, Video } from "lucide-react";

import { deleteLiveClass } from "@/app/admin/live-classes/actions";
import {
  LiveClassDialog,
  type LiveClassOption,
  type LiveClassValues,
} from "./live-class-dialog";
import { IDLE } from "@/lib/action-result";
import { useActionToast } from "@/hooks/use-action-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export type LiveClassRow = LiveClassValues & {
  batchLabel: string;
  subjectName: string | null;
  teacherName: string | null;
};

const STATUS_VARIANT = {
  PUBLISHED: "default",
  DRAFT: "secondary",
  CLOSED: "outline",
  CANCELLED: "destructive",
} as const;

export function LiveClassList({
  items,
  batches,
  subjects,
  teachers,
  canManage = true,
}: {
  items: LiveClassRow[];
  batches: LiveClassOption[];
  subjects: LiveClassOption[];
  teachers?: LiveClassOption[];
  canManage?: boolean;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <Video className="size-6" />
          </div>
          <div>
            <p className="text-foreground font-medium">No live classes</p>
            <p className="text-sm">Scheduled Google Meet sessions will appear here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <LiveClassCard
          key={item.id}
          item={item}
          batches={batches}
          subjects={subjects}
          teachers={teachers}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function LiveClassCard({
  item,
  batches,
  subjects,
  teachers,
  canManage,
}: {
  item: LiveClassRow;
  batches: LiveClassOption[];
  subjects: LiveClassOption[];
  teachers?: LiveClassOption[];
  canManage: boolean;
}) {
  const [state, action] = useActionState(deleteLiveClass, IDLE);
  useActionToast(state);

  const scheduled = new Date(item.scheduledAt);
  const endsAt = new Date(scheduled.getTime() + item.durationMinutes * 60_000);
  const now = new Date();
  const isLive = now >= scheduled && now <= endsAt && item.status === "PUBLISHED";
  const isPast = now > endsAt;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{item.title}</p>
            {isLive ? (
              <Badge className="gap-1.5 bg-red-500 hover:bg-red-500">
                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                Live now
              </Badge>
            ) : (
              <Badge variant={STATUS_VARIANT[item.status]}>
                {item.status.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {item.batchLabel}
            {item.subjectName && ` · ${item.subjectName}`}
            {item.teacherName && ` · ${item.teacherName}`}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {formatDate(scheduled, "datetime")} · {item.durationMinutes} min
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            variant={isLive ? "default" : "outline"}
            disabled={isPast}
          >
            <a href={item.meetingLink} target="_blank" rel="noopener noreferrer">
              <Video className="size-4" />
              {isLive ? "Join now" : "Open link"}
            </a>
          </Button>

          {canManage && (
            <>
              <LiveClassDialog
                mode="edit"
                liveClass={item}
                batches={batches}
                subjects={subjects}
                teachers={teachers}
              />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="text-destructive">
                    <Trash2 className="size-4" />
                    <span className="sr-only">Delete {item.title}</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this live class?</AlertDialogTitle>
                    <AlertDialogDescription>
                      &ldquo;{item.title}&rdquo; will be removed and students will no
                      longer see it on their dashboard.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <form action={action}>
                      <input type="hidden" name="id" value={item.id} />
                      <AlertDialogAction type="submit">Delete</AlertDialogAction>
                    </form>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
