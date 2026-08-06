"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import {
  createLiveClass,
  updateLiveClass,
} from "@/app/admin/live-classes/actions";
import { IDLE } from "@/lib/action-result";
import { useActionToast } from "@/hooks/use-action-toast";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type LiveClassOption = { id: string; label: string };

export type LiveClassValues = {
  id: string;
  title: string;
  description: string | null;
  meetingLink: string;
  batchId: string;
  subjectId: string | null;
  teacherId: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED";
};

/** Formats a Date for <input type="datetime-local">, which wants local time. */
function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LiveClassDialog({
  mode,
  liveClass,
  batches,
  subjects,
  teachers,
}: {
  mode: "create" | "edit";
  liveClass?: LiveClassValues;
  batches: LiveClassOption[];
  subjects: LiveClassOption[];
  /** Omitted for teachers — they can only schedule their own classes. */
  teachers?: LiveClassOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    mode === "create" ? createLiveClass : updateLiveClass,
    IDLE,
  );
  const [formKey, setFormKey] = useState(0);

  useActionToast(state, () => {
    setOpen(false);
    setFormKey((k) => k + 1);
  });

  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button>
            <Plus className="size-4" />
            Schedule class
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Schedule a live class" : "Edit live class"}
          </DialogTitle>
          <DialogDescription>
            Paste the Google Meet link. Students in the batch see it on their
            dashboard and can join from there.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          {liveClass && <input type="hidden" name="id" value={liveClass.id} />}

          <div className="space-y-2">
            <Label htmlFor="lc-title">Title</Label>
            <Input
              id="lc-title"
              name="title"
              defaultValue={liveClass?.title}
              placeholder="e.g. Chapter 5 — Thermodynamics revision"
            />
            {err("title") && <p className="text-destructive text-sm">{err("title")}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lc-link">Meeting link</Label>
            <Input
              id="lc-link"
              name="meetingLink"
              type="url"
              inputMode="url"
              defaultValue={liveClass?.meetingLink}
              placeholder="https://meet.google.com/abc-defg-hij"
            />
            {err("meetingLink") && (
              <p className="text-destructive text-sm">{err("meetingLink")}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lc-batch">Batch</Label>
              <Select name="batchId" defaultValue={liveClass?.batchId}>
                <SelectTrigger id="lc-batch">
                  <SelectValue placeholder="Choose a batch" />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.id} value={batch.id}>
                      {batch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err("batchId") && <p className="text-destructive text-sm">{err("batchId")}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lc-subject">Subject</Label>
              <Select name="subjectId" defaultValue={liveClass?.subjectId ?? "none"}>
                <SelectTrigger id="lc-subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      {subject.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lc-when">Date & time</Label>
              <Input
                id="lc-when"
                name="scheduledAt"
                type="datetime-local"
                defaultValue={
                  liveClass ? toLocalInput(new Date(liveClass.scheduledAt)) : ""
                }
              />
              {err("scheduledAt") && (
                <p className="text-destructive text-sm">{err("scheduledAt")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lc-duration">Duration (minutes)</Label>
              <Input
                id="lc-duration"
                name="durationMinutes"
                type="number"
                min={5}
                max={480}
                defaultValue={liveClass?.durationMinutes ?? 60}
              />
            </div>

            {teachers && (
              <div className="space-y-2">
                <Label htmlFor="lc-teacher">Teacher</Label>
                <Select name="teacherId" defaultValue={liveClass?.teacherId ?? "none"}>
                  <SelectTrigger id="lc-teacher">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "edit" && (
              <div className="space-y-2">
                <Label htmlFor="lc-status">Status</Label>
                <Select name="status" defaultValue={liveClass?.status ?? "PUBLISHED"}>
                  <SelectTrigger id="lc-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                    <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                    <SelectItem value="CLOSED">Finished</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lc-description">Description (optional)</Label>
            <Textarea
              id="lc-description"
              name="description"
              rows={2}
              defaultValue={liveClass?.description ?? ""}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>
              {mode === "create" ? "Schedule" : "Save changes"}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
