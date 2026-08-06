"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { createTeacher, updateTeacher } from "./actions";
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
import { UPLOAD_LIMITS } from "@/lib/upload-limits";

export type TeacherFormValues = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  employeeId: string | null;
  designation: string | null;
  qualification: string | null;
  specialization: string | null;
  bio: string | null;
  joiningDate: Date | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
};

export function TeacherFormDialog({
  mode,
  teacher,
}: {
  mode: "create" | "edit";
  teacher?: TeacherFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    mode === "create" ? createTeacher : updateTeacher,
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
            Add teacher
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Pencil className="size-4" />
            Edit profile
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add a teacher" : "Edit teacher"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "A portal account is created at the same time, so they can sign in straight away."
              : "Changes apply to both the profile and the sign-in account."}
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          {teacher && <input type="hidden" name="id" value={teacher.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="fullName" error={err("fullName")} required>
              <Input id="fullName" name="fullName" defaultValue={teacher?.fullName} />
            </Field>

            <Field label="Email" name="email" error={err("email")} required>
              <Input id="email" name="email" type="email" defaultValue={teacher?.email ?? ""} />
            </Field>

            {mode === "create" && (
              <Field
                label="Temporary password"
                name="password"
                error={err("password")}
                hint="At least 8 characters. Share it with the teacher to change on first login."
                required
              >
                <Input id="password" name="password" type="password" autoComplete="new-password" />
              </Field>
            )}

            <Field label="Phone" name="phone" error={err("phone")}>
              <Input id="phone" name="phone" defaultValue={teacher?.phone ?? ""} placeholder="01XXXXXXXXX" />
            </Field>

            <Field label="Employee ID" name="employeeId" error={err("employeeId")}>
              <Input id="employeeId" name="employeeId" defaultValue={teacher?.employeeId ?? ""} />
            </Field>

            <Field label="Designation" name="designation" error={err("designation")}>
              <Input
                id="designation"
                name="designation"
                defaultValue={teacher?.designation ?? ""}
                placeholder="e.g. Senior Lecturer"
              />
            </Field>

            <Field label="Qualification" name="qualification" error={err("qualification")}>
              <Input
                id="qualification"
                name="qualification"
                defaultValue={teacher?.qualification ?? ""}
                placeholder="e.g. MSc in Physics"
              />
            </Field>

            <Field label="Specialisation" name="specialization" error={err("specialization")}>
              <Input
                id="specialization"
                name="specialization"
                defaultValue={teacher?.specialization ?? ""}
                placeholder="e.g. Mechanics, Optics"
              />
            </Field>

            <Field label="Joining date" name="joiningDate" error={err("joiningDate")}>
              <Input
                id="joiningDate"
                name="joiningDate"
                type="date"
                defaultValue={
                  teacher?.joiningDate
                    ? new Date(teacher.joiningDate).toISOString().slice(0, 10)
                    : ""
                }
              />
            </Field>

            <Field label="Status" name="status" error={err("status")}>
              <Select name="status" defaultValue={teacher?.status ?? "ACTIVE"}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On leave</SelectItem>
                  <SelectItem value="INACTIVE">Inactive (no portal access)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Photo" name="photo" hint={UPLOAD_LIMITS.image.label}>
            <Input
              id="photo"
              name="photo"
              type="file"
              accept={UPLOAD_LIMITS.image.mimeTypes.join(",")}
            />
          </Field>

          <Field label="Short bio" name="bio" error={err("bio")}>
            <Textarea id="bio" name="bio" rows={3} defaultValue={teacher?.bio ?? ""} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>
              {mode === "create" ? "Add teacher" : "Save changes"}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!error && hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
