"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { ok, fail, toActionState, type ActionState } from "@/lib/action-result";
import { liveClassSchema } from "@/lib/validation";

/**
 * Google Meet live classes.
 *
 * Teachers may only schedule classes for batches they are assigned to; admins
 * may schedule for any batch. That check happens server-side here, not in the
 * UI, because a Server Action is a POST endpoint anyone can call directly.
 */

async function assertCanManageBatch(batchId: string) {
  const session = await assertRole("ADMIN", "TEACHER");

  if (session.user.role === "ADMIN") return session;

  const assignment = await prisma.teacherAssignment.findFirst({
    where: { teacherId: session.user.profileId ?? "", batchId },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("You are not assigned to that batch.");
  }
  return session;
}

function parseForm(formData: FormData) {
  return liveClassSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
    meetingLink: formData.get("meetingLink"),
    batchId: formData.get("batchId"),
    subjectId: formData.get("subjectId") === "none" ? null : formData.get("subjectId"),
    teacherId: formData.get("teacherId") === "none" ? null : formData.get("teacherId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes") || 60,
  });
}

export async function createLiveClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const data = parseForm(formData);
    const session = await assertCanManageBatch(data.batchId);

    // A teacher scheduling their own class is always the owner of it.
    const teacherId =
      session.user.role === "TEACHER" ? session.user.profileId : data.teacherId;

    await prisma.liveClass.create({ data: { ...data, teacherId } });

    revalidatePath("/admin/live-classes");
    revalidatePath("/teacher/live-classes");
    revalidatePath("/student/live-classes");
    return ok("Live class scheduled.");
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateLiveClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");
    const data = parseForm(formData);

    const existing = await prisma.liveClass.findUnique({
      where: { id },
      select: { batchId: true },
    });
    if (!existing) return fail("That live class no longer exists.");

    // Check both the current and the target batch, so a teacher cannot move a
    // class into (or out of) a batch they don't teach.
    await assertCanManageBatch(existing.batchId);
    if (existing.batchId !== data.batchId) await assertCanManageBatch(data.batchId);

    const status = formData.get("status");
    await prisma.liveClass.update({
      where: { id },
      data: {
        ...data,
        ...(typeof status === "string" && status !== ""
          ? { status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED"]).parse(status) }
          : {}),
      },
    });

    revalidatePath("/admin/live-classes");
    revalidatePath("/teacher/live-classes");
    revalidatePath("/student/live-classes");
    return ok("Live class updated.");
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteLiveClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const id = String(formData.get("id") ?? "");

    const existing = await prisma.liveClass.findUnique({
      where: { id },
      select: { batchId: true },
    });
    if (!existing) return fail("That live class no longer exists.");

    await assertCanManageBatch(existing.batchId);
    await prisma.liveClass.delete({ where: { id } });

    revalidatePath("/admin/live-classes");
    revalidatePath("/teacher/live-classes");
    revalidatePath("/student/live-classes");
    return ok("Live class removed.");
  } catch (error) {
    return toActionState(error);
  }
}
