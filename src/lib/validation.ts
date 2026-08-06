import { z } from "zod";

/**
 * Shared Zod schemas. Every Server Action parses its input through one of
 * these — the client-side form is a convenience, never the security boundary.
 */

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username."),
  password: z.string().min(1, "Enter your password."),
});

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

/** Bangladeshi mobile number, with or without the +88 country code. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+?88)?01[3-9]\d{8}$/, "Enter a valid Bangladeshi mobile number.");

export const optionalPhoneSchema = z
  .union([phoneSchema, z.literal("")])
  .transform((value) => (value === "" ? null : value));

/** Trims, then converts an empty string to null — HTML forms submit "" not null. */
export const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: "Enter a valid date.",
  })
  .transform((value) => (value === null ? null : new Date(value)));

/** "HH:mm", as stored by ClassRoutine and AttendanceSession. */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time as HH:mm.");

export const admissionSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the applicant's full name.").max(120),
  fatherName: optionalText,
  motherName: optionalText,
  mobile: phoneSchema,
  email: z.union([z.email("Enter a valid email address."), z.literal("")])
    .transform((value) => (value === "" ? null : value.toLowerCase())),
  address: optionalText,
  qualification: optionalText,
  courseId: z.string().trim().min(1, "Choose a course."),
  message: optionalText,
});

export const testimonialSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  courseName: optionalText,
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().trim().min(10, "Please write at least a sentence.").max(2000),
});

export const galleryCategorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(80),
  description: optionalText,
  isActive: z.coerce.boolean().default(true),
});

/** The seven teacher-evaluation criteria, each scored 1–5. */
export const EVALUATION_CRITERIA = [
  { key: "teachingQuality", label: "Teaching quality" },
  { key: "explanationClarity", label: "Explanation clarity" },
  { key: "classManagement", label: "Class management" },
  { key: "timeManagement", label: "Time management" },
  { key: "communicationSkills", label: "Communication skills" },
  { key: "courseDelivery", label: "Course delivery" },
  { key: "studentSatisfaction", label: "Overall satisfaction" },
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number]["key"];

const ratingSchema = z.coerce
  .number()
  .int()
  .min(1, "Give a rating between 1 and 5.")
  .max(5, "Give a rating between 1 and 5.");

export const teacherEvaluationSchema = z.object({
  teacherId: z.string().min(1),
  batchId: z.string().min(1).nullable().catch(null),
  teachingQuality: ratingSchema,
  explanationClarity: ratingSchema,
  classManagement: ratingSchema,
  timeManagement: ratingSchema,
  communicationSkills: ratingSchema,
  courseDelivery: ratingSchema,
  studentSatisfaction: ratingSchema,
  comment: z.string().trim().max(2000).optional().transform((v) => v || null),
  isAnonymous: z.coerce.boolean().default(false),
});

export const liveClassSchema = z.object({
  title: z.string().trim().min(3, "Enter a meeting title.").max(160),
  description: optionalText,
  meetingLink: z
    .url("Enter a valid meeting URL.")
    .refine(
      (url) => /^https:\/\/(meet\.google\.com|[\w-]+\.zoom\.us|zoom\.us|teams\.microsoft\.com)/.test(url),
      "Enter a Google Meet, Zoom or Teams link.",
    ),
  batchId: z.string().min(1, "Choose a batch."),
  subjectId: z.string().min(1).nullable().catch(null),
  teacherId: z.string().min(1).nullable().catch(null),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(60),
});

/** Formats a ZodError into the `{ field: message }` shape Server Actions return. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
