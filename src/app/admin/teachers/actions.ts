"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { assertRole } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/storage";
import { ok, fail, toActionState, type ActionState } from "@/lib/action-result";
import { optionalPhoneSchema, optionalText, passwordSchema } from "@/lib/validation";

/**
 * Teacher management — entirely new. The legacy system had no teacher entity;
 * `class_routine.teacher_name` and `trial_classes.teacher_name` were free text.
 *
 * A Teacher is always created together with its User, in one transaction, so a
 * teacher profile can never exist without an account to sign in with.
 */

const teacherSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the teacher's full name.").max(120),
  email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
  phone: optionalPhoneSchema,
  employeeId: optionalText,
  designation: optionalText,
  qualification: optionalText,
  specialization: optionalText,
  bio: optionalText,
  joiningDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : new Date(v)))
    .nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]).default("ACTIVE"),
});

function parseTeacherForm(formData: FormData) {
  return teacherSchema.parse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    employeeId: formData.get("employeeId"),
    designation: formData.get("designation"),
    qualification: formData.get("qualification"),
    specialization: formData.get("specialization"),
    bio: formData.get("bio"),
    joiningDate: formData.get("joiningDate") ?? "",
    status: formData.get("status") ?? "ACTIVE",
  });
}

export async function createTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const data = parseTeacherForm(formData);
    const password = passwordSchema.parse(formData.get("password"));

    const taken = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (taken) return fail("That email address is already registered.");

    const photo = formData.get("photo");
    const photoUrl =
      photo instanceof File && photo.size > 0
        ? (await uploadFile(photo, "teachers", "image")).url
        : null;

    const { email, ...profile } = data;

    await prisma.teacher.create({
      data: {
        ...profile,
        photoUrl,
        user: {
          create: {
            email,
            name: profile.fullName,
            role: "TEACHER",
            image: photoUrl,
            passwordHash: await bcrypt.hash(password, 12),
          },
        },
      },
    });

    revalidatePath("/admin/teachers");
    return ok(`${data.fullName} added. They can sign in with ${email}.`);
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const id = String(formData.get("id") ?? "");
    const data = parseTeacherForm(formData);

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { userId: true, photoUrl: true },
    });
    if (!teacher) return fail("That teacher no longer exists.");

    const photo = formData.get("photo");
    const photoUrl =
      photo instanceof File && photo.size > 0
        ? (await uploadFile(photo, "teachers", "image")).url
        : teacher.photoUrl;

    const { email, ...profile } = data;

    await prisma.$transaction([
      prisma.teacher.update({
        where: { id },
        data: { ...profile, photoUrl },
      }),
      prisma.user.update({
        where: { id: teacher.userId },
        data: {
          email,
          name: profile.fullName,
          image: photoUrl,
          // A teacher marked inactive loses portal access immediately.
          isActive: profile.status === "ACTIVE",
        },
      }),
    ]);

    revalidatePath("/admin/teachers");
    revalidatePath(`/admin/teachers/${id}`);
    return ok("Teacher updated.");
  } catch (error) {
    return toActionState(error);
  }
}

export async function resetTeacherPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const id = String(formData.get("id") ?? "");
    const password = passwordSchema.parse(formData.get("password"));

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!teacher) return fail("That teacher no longer exists.");

    await prisma.user.update({
      where: { id: teacher.userId },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    });

    return ok("Password reset.");
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Deleting the User cascades to the Teacher row. Assignments, routines and
 * live classes use SetNull, so historical records survive with the teacher
 * field cleared rather than disappearing.
 */
export async function deleteTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const id = String(formData.get("id") ?? "");
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      select: { userId: true, fullName: true },
    });
    if (!teacher) return fail("That teacher no longer exists.");

    await prisma.user.delete({ where: { id: teacher.userId } });

    revalidatePath("/admin/teachers");
    return ok(`${teacher.fullName} removed.`);
  } catch (error) {
    return toActionState(error);
  }
}

// ---------------------------------------------------------------------------
// Course / batch assignment
// ---------------------------------------------------------------------------

const assignmentSchema = z.object({
  teacherId: z.string().min(1),
  batchId: z.string().min(1, "Choose a batch."),
  subjectId: z
    .string()
    .transform((v) => (v === "" || v === "none" ? null : v))
    .nullable(),
});

export async function assignTeacher(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const data = assignmentSchema.parse({
      teacherId: formData.get("teacherId"),
      batchId: formData.get("batchId"),
      subjectId: formData.get("subjectId") ?? "",
    });

    // The compound unique includes a nullable subjectId, and Postgres does not
    // treat NULLs as equal, so findFirst is required to detect a duplicate.
    const existing = await prisma.teacherAssignment.findFirst({
      where: data,
      select: { id: true },
    });
    if (existing) return fail("That teacher is already assigned to this batch and subject.");

    await prisma.teacherAssignment.create({ data });

    revalidatePath(`/admin/teachers/${data.teacherId}`);
    return ok("Assignment added.");
  } catch (error) {
    return toActionState(error);
  }
}

export async function removeAssignment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const id = String(formData.get("id") ?? "");
    const assignment = await prisma.teacherAssignment.delete({ where: { id } });

    revalidatePath(`/admin/teachers/${assignment.teacherId}`);
    return ok("Assignment removed.");
  } catch (error) {
    return toActionState(error);
  }
}
