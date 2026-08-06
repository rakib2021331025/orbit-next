"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfileId } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { ok, fail, toActionState, type ActionState } from "@/lib/action-result";
import { EVALUATION_CRITERIA, teacherEvaluationSchema } from "@/lib/validation";

/**
 * Student → teacher evaluation.
 *
 * Anonymity is a *display* property, not a storage one: `studentId` is always
 * recorded so admins can audit and so the one-evaluation-per-batch rule can be
 * enforced, but the teacher-facing queries never select it when `isAnonymous`.
 */
export async function submitEvaluation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const studentId = await requireStudentProfileId();

    const data = teacherEvaluationSchema.parse({
      teacherId: formData.get("teacherId"),
      batchId: formData.get("batchId") || null,
      teachingQuality: formData.get("teachingQuality"),
      explanationClarity: formData.get("explanationClarity"),
      classManagement: formData.get("classManagement"),
      timeManagement: formData.get("timeManagement"),
      communicationSkills: formData.get("communicationSkills"),
      courseDelivery: formData.get("courseDelivery"),
      studentSatisfaction: formData.get("studentSatisfaction"),
      comment: formData.get("comment") ?? "",
      isAnonymous: formData.get("isAnonymous") === "on",
    });

    // A student may only rate a teacher who actually teaches a batch they are
    // enrolled in — otherwise anyone could rate anyone.
    const teaches = await prisma.teacherAssignment.findFirst({
      where: {
        teacherId: data.teacherId,
        batch: { enrollments: { some: { studentId } } },
        ...(data.batchId ? { batchId: data.batchId } : {}),
      },
      select: { batchId: true },
    });
    if (!teaches) {
      return fail("You can only evaluate teachers who teach one of your batches.");
    }

    const batchId = data.batchId ?? teaches.batchId;

    const scores = EVALUATION_CRITERIA.map(({ key }) => data[key]);
    const averageRating =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;

    // Upsert so a student can revise their evaluation rather than being blocked
    // by the unique constraint.
    await prisma.teacherEvaluation.upsert({
      where: {
        teacherId_studentId_batchId: {
          teacherId: data.teacherId,
          studentId,
          batchId,
        },
      },
      update: { ...data, batchId, studentId, averageRating },
      create: { ...data, batchId, studentId, averageRating },
    });

    revalidatePath("/student/evaluations");
    revalidatePath("/teacher/evaluations");
    revalidatePath("/admin/evaluations");
    return ok("Thank you — your feedback has been recorded.");
  } catch (error) {
    return toActionState(error);
  }
}
