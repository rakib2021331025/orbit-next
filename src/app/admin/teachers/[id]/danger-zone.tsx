"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";

import { deleteTeacher, resetTeacherPassword } from "../actions";
import { IDLE } from "@/lib/action-result";
import { useActionToast } from "@/hooks/use-action-toast";
import { SubmitButton } from "@/components/submit-button";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DangerZone({
  teacherId,
  teacherName,
}: {
  teacherId: string;
  teacherName: string;
}) {
  const router = useRouter();
  const [resetState, resetAction] = useActionState(resetTeacherPassword, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteTeacher, IDLE);

  useActionToast(resetState);
  useActionToast(deleteState, () => router.push("/admin/teachers"));

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base">Account & access</CardTitle>
        <CardDescription>
          Reset the sign-in password, or remove this teacher entirely.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form action={resetAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={teacherId} />
          <div className="min-w-56 flex-1 space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            {resetState.fieldErrors?.password && (
              <p className="text-destructive text-sm">{resetState.fieldErrors.password}</p>
            )}
          </div>
          <SubmitButton variant="outline" pendingLabel="Resetting…">
            <KeyRound className="size-4" />
            Reset password
          </SubmitButton>
        </form>

        <div className="border-destructive/30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <div>
            <p className="text-sm font-medium">Remove this teacher</p>
            <p className="text-muted-foreground text-sm">
              Their account is deleted. Past classes, exams and attendance are kept.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="size-4" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {teacherName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their sign-in account and profile are permanently deleted. Records
                  they created — attendance sessions, exams, live classes — are kept,
                  but will no longer show a teacher name. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={teacherId} />
                  <AlertDialogAction type="submit">Remove teacher</AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
