"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";

import { assignTeacher, removeAssignment } from "../actions";
import { IDLE } from "@/lib/action-result";
import { useActionToast } from "@/hooks/use-action-toast";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; label: string };

export function AssignmentManager({
  teacherId,
  assignments,
  batches,
  subjects,
}: {
  teacherId: string;
  assignments: Array<{ id: string; batchLabel: string; subjectName: string | null }>;
  batches: Option[];
  subjects: Option[];
}) {
  const [state, action] = useActionState(assignTeacher, IDLE);
  const [formKey, setFormKey] = useState(0);
  useActionToast(state, () => setFormKey((k) => k + 1));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Course assignments</CardTitle>
        <CardDescription>
          Which batches and subjects this teacher is responsible for. Assignments
          drive what they can see in their own dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form key={formKey} action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="teacherId" value={teacherId} />

          <div className="space-y-2">
            <Label htmlFor="assign-batch">Batch</Label>
            <Select name="batchId">
              <SelectTrigger id="assign-batch">
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
            {state.fieldErrors?.batchId && (
              <p className="text-destructive text-sm">{state.fieldErrors.batchId}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="assign-subject">Subject (optional)</Label>
            <Select name="subjectId" defaultValue="none">
              <SelectTrigger id="assign-subject">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All subjects</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <SubmitButton variant="outline" className="w-full sm:w-auto">
              <Plus className="size-4" />
              Assign
            </SubmitButton>
          </div>
        </form>

        {assignments.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No assignments yet. Assign a batch above so this teacher can take
            attendance and create exams for it.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {assignments.map((assignment) => (
              <AssignmentRow key={assignment.id} assignment={assignment} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentRow({
  assignment,
}: {
  assignment: { id: string; batchLabel: string; subjectName: string | null };
}) {
  const [state, action] = useActionState(removeAssignment, IDLE);
  useActionToast(state);

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{assignment.batchLabel}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="secondary">{assignment.subjectName ?? "All subjects"}</Badge>
        <form action={action}>
          <input type="hidden" name="id" value={assignment.id} />
          <Button type="submit" size="sm" variant="ghost" className="text-destructive">
            <X className="size-4" />
            <span className="sr-only">Remove assignment</span>
          </Button>
        </form>
      </div>
    </li>
  );
}
