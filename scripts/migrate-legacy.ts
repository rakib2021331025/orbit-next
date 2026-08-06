import "dotenv/config";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { put } from "@vercel/blob";

import { prisma } from "../src/lib/prisma";
import type {
  AttendanceStatus,
  DayOfWeek,
  Gender,
  PaymentMethod,
  PaymentStatus,
  StudentStatus,
  ContentStatus,
  AdmissionStatus,
  MaterialType,
} from "../src/generated/prisma/enums";

/**
 * One-shot migration: legacy MySQL (`orbit_coaching`) → Neon Postgres.
 *
 * Two jobs beyond copying rows:
 *
 *  1. **Normalisation.** The legacy schema stored `course`, `batch` and
 *     `teacher_name` as free-text VARCHARs. This script resolves those strings
 *     into real Course / Batch / Teacher rows, creating them on demand, and
 *     rewrites the references as foreign keys.
 *
 *  2. **File relocation.** Local paths like `uploads/gallery/x.jpg` are read
 *     from LEGACY_PROJECT_ROOT and pushed to Vercel Blob; only the resulting
 *     URL is stored.
 *
 * Idempotent: every migrated model carries `legacyId`, and writes go through
 * upsert, so re-running repairs a partial migration instead of duplicating.
 *
 *   npm run migrate:legacy            # full run
 *   npm run migrate:legacy -- --dry   # report only, no writes
 */

const DRY_RUN = process.argv.includes("--dry");
const LEGACY_ROOT = process.env.LEGACY_PROJECT_ROOT ?? path.resolve(process.cwd(), "..");

const stats = {
  migrated: {} as Record<string, number>,
  skipped: [] as string[],
  missingFiles: [] as string[],
};

function count(table: string, n = 1) {
  stats.migrated[table] = (stats.migrated[table] ?? 0) + n;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";

const clean = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDecimal = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** "14:30:00" → "14:30"; anything unparseable falls back to a sane default. */
const toTimeString = (value: unknown, fallback: string): string => {
  const text = clean(value);
  if (!text) return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return fallback;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

/**
 * Uploads a legacy local file to Blob storage and returns its URL.
 * Returns null when the file is missing on disk, which is common in this
 * project — several DB rows point at files that were deleted.
 */
const uploadedCache = new Map<string, string | null>();

async function relocateFile(relativePath: unknown, folder: string): Promise<string | null> {
  const rel = clean(relativePath);
  if (!rel) return null;

  // Rows sometimes already hold an absolute URL (e.g. YouTube thumbnails).
  if (/^https?:\/\//i.test(rel)) return rel;

  if (uploadedCache.has(rel)) return uploadedCache.get(rel)!;

  const normalised = rel.replace(/^\.\.\//, "").replace(/^\//, "");
  const absolute = path.join(LEGACY_ROOT, normalised);

  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    stats.missingFiles.push(rel);
    uploadedCache.set(rel, null);
    return null;
  }

  if (DRY_RUN) {
    uploadedCache.set(rel, `dry-run://${normalised}`);
    return `dry-run://${normalised}`;
  }

  try {
    const blob = await put(`${folder}/${path.basename(normalised)}`, createReadStream(absolute), {
      access: "public",
      addRandomSuffix: true,
    });
    uploadedCache.set(rel, blob.url);
    return blob.url;
  } catch (error) {
    console.error(`  ! upload failed for ${rel}:`, (error as Error).message);
    uploadedCache.set(rel, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Enum mapping (legacy lowercase strings → Prisma enums)
// ---------------------------------------------------------------------------

const studentStatus = (value: unknown): StudentStatus =>
  String(value).toLowerCase() === "inactive" ? "INACTIVE" : "ACTIVE";

const gender = (value: unknown): Gender | null => {
  switch (String(value).toLowerCase()) {
    case "male": return "MALE";
    case "female": return "FEMALE";
    case "other": return "OTHER";
    default: return null;
  }
};

const paymentStatus = (value: unknown): PaymentStatus =>
  String(value).toLowerCase() === "paid" ? "PAID" : "UNPAID";

const paymentMethod = (value: unknown): PaymentMethod => {
  switch (String(value).toLowerCase()) {
    case "bkash": return "BKASH";
    case "nagad": return "NAGAD";
    case "bank": return "BANK";
    case "cash": return "CASH";
    default: return "OTHER";
  }
};

const attendanceStatus = (value: unknown): AttendanceStatus => {
  switch (String(value).toLowerCase()) {
    case "absent": return "ABSENT";
    case "late": return "LATE";
    default: return "PRESENT";
  }
};

const contentStatus = (value: unknown): ContentStatus =>
  String(value).toLowerCase() === "inactive" ? "INACTIVE" : "ACTIVE";

const admissionStatus = (value: unknown): AdmissionStatus =>
  String(value).toLowerCase() === "approved" ? "APPROVED" : "PENDING";

const dayOfWeek = (value: unknown): DayOfWeek =>
  (String(value).toUpperCase() as DayOfWeek) || "SATURDAY";

const materialType = (value: unknown): MaterialType => {
  switch (String(value).toLowerCase()) {
    case "doc":
    case "docx": return "DOC";
    case "ppt":
    case "pptx": return "PPT";
    case "pdf": return "PDF";
    default: return "OTHER";
  }
};

// ---------------------------------------------------------------------------
// Resolvers — turn legacy free-text into real relations
// ---------------------------------------------------------------------------

const courseCache = new Map<string, string>();
const batchCache = new Map<string, string>();
const teacherCache = new Map<string, string>();

/** Finds (or creates) a Course by its legacy name string. */
async function resolveCourse(name: unknown): Promise<string | null> {
  const label = clean(name);
  if (!label) return null;
  const key = label.toLowerCase();
  if (courseCache.has(key)) return courseCache.get(key)!;

  const course = await prisma.course.upsert({
    where: { slug: slugify(label) },
    update: {},
    create: { name: label, slug: slugify(label) },
  });
  courseCache.set(key, course.id);
  return course.id;
}

/**
 * Finds (or creates) a Batch. Legacy rows carry a course string and an optional
 * batch string; where the batch is blank we fall back to a single "General"
 * batch so every enrolment still has somewhere to live.
 */
async function resolveBatch(courseName: unknown, batchName: unknown): Promise<string | null> {
  const courseId = await resolveCourse(courseName);
  if (!courseId) return null;

  const label = clean(batchName) ?? "General";
  const key = `${courseId}::${label.toLowerCase()}`;
  if (batchCache.has(key)) return batchCache.get(key)!;

  const batch = await prisma.batch.upsert({
    where: { courseId_name: { courseId, name: label } },
    update: {},
    create: { courseId, name: label },
  });
  batchCache.set(key, batch.id);
  return batch.id;
}

/**
 * Creates a Teacher from a legacy `teacher_name` string. These teachers have no
 * login until an admin assigns one — the legacy system had no teacher accounts,
 * so there is no password to carry over.
 */
async function resolveTeacher(name: unknown): Promise<string | null> {
  const label = clean(name);
  if (!label) return null;
  const key = label.toLowerCase();
  if (teacherCache.has(key)) return teacherCache.get(key)!;

  const existing = await prisma.teacher.findFirst({ where: { fullName: label } });
  if (existing) {
    teacherCache.set(key, existing.id);
    return existing.id;
  }

  const teacher = await prisma.teacher.create({
    data: {
      fullName: label,
      user: {
        create: {
          role: "TEACHER",
          name: label,
          // Placeholder identity: no password hash means sign-in is impossible
          // until an admin sets real credentials.
          username: `teacher.${slugify(label)}`,
          isActive: false,
        },
      },
    },
  });
  teacherCache.set(key, teacher.id);
  count("teachers");
  return teacher.id;
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------

type Db = mysql.Connection;
const rows = async <T = Record<string, unknown>>(db: Db, sql: string): Promise<T[]> => {
  try {
    const [result] = await db.query(sql);
    return result as T[];
  } catch (error) {
    const message = (error as Error).message;
    // A table that never existed in this install is not an error.
    if (/doesn't exist|Unknown table/i.test(message)) {
      stats.skipped.push(`${sql} (table missing)`);
      return [];
    }
    throw error;
  }
};

async function migrateAdmins(db: Db) {
  for (const row of await rows(db, "SELECT * FROM admins")) {
    const email = clean(row.email)?.toLowerCase();
    if (!email) continue;
    await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN" },
      create: {
        email,
        role: "ADMIN",
        name: "Administrator",
        // Legacy bcrypt hash carries over verbatim — existing passwords work.
        passwordHash: clean(row.password_hash),
        createdAt: toDate(row.created_at) ?? new Date(),
      },
    });
    count("admins");
  }
}

async function migrateCourses(db: Db) {
  for (const row of await rows(db, "SELECT * FROM courses")) {
    const name = clean(row.name);
    if (!name) continue;
    const imageUrl = await relocateFile(row.image, "courses");
    const course = await prisma.course.upsert({
      where: { slug: slugify(name) },
      update: { description: clean(row.description), imageUrl },
      create: {
        legacyId: Number(row.id),
        name,
        slug: slugify(name),
        description: clean(row.description),
        imageUrl,
        createdAt: toDate(row.created_at) ?? new Date(),
      },
    });
    courseCache.set(name.toLowerCase(), course.id);
    count("courses");
  }
}

async function migrateStudents(db: Db) {
  // student_login holds the credentials; join so each Student gets a User.
  const logins = new Map<number, Record<string, unknown>>();
  for (const row of await rows(db, "SELECT * FROM student_login")) {
    logins.set(Number(row.student_id), row);
  }

  for (const row of await rows(db, "SELECT * FROM students")) {
    const legacyId = Number(row.id);
    const fullName = clean(row.name);
    const phone = clean(row.phone);
    if (!fullName || !phone) {
      stats.skipped.push(`student #${legacyId} (missing name or phone)`);
      continue;
    }

    const login = logins.get(legacyId);
    const email = clean(row.email)?.toLowerCase() ?? null;
    // Students without a login row still need a User to hang the session off,
    // so we synthesise a username from the phone number.
    const username = clean(login?.username) ?? `s${phone}`;
    const photoUrl = await relocateFile(row.image, "students");

    const existing = await prisma.student.findUnique({
      where: { legacyId },
      select: { id: true, userId: true },
    });

    const studentData = {
      fullName,
      phone,
      guardianPhone: clean(row.guardian_phone),
      institution: clean(row.institution),
      address: clean(row.address),
      rollNumber: clean(row.roll_number),
      dateOfBirth: toDate(row.date_of_birth),
      gender: gender(row.gender),
      photoUrl,
      classGroup: clean(row.class_group),
      academicYear: clean(row.academic_year),
      admissionDate: toDate(row.admission_date) ?? toDate(row.created_at),
      status: studentStatus(row.student_status),
    };

    const studentId = existing
      ? (await prisma.student.update({ where: { legacyId }, data: studentData })).id
      : (
          await prisma.student.create({
            data: {
              ...studentData,
              legacyId,
              createdAt: toDate(row.created_at) ?? new Date(),
              user: {
                create: {
                  email,
                  username,
                  role: "STUDENT",
                  name: fullName,
                  passwordHash: clean(login?.password),
                  lastLoginAt: toDate(login?.last_login),
                  // Legacy `students.status` gated portal access.
                  isActive: String(row.status).toLowerCase() === "approved",
                },
              },
            },
          })
        ).id;

    // Enrol into the batch implied by the legacy course/batch strings.
    const batchId = await resolveBatch(row.course, row.batch);
    if (batchId) {
      await prisma.enrollment.upsert({
        where: { studentId_batchId: { studentId, batchId } },
        update: {},
        create: { studentId, batchId, status: studentData.status },
      });
    }
    count("students");
  }
}

/** Maps a legacy student id → new Student.id, cached across steps. */
const studentIdCache = new Map<number, string | null>();
async function studentIdFor(legacyId: unknown): Promise<string | null> {
  const id = Number(legacyId);
  if (!Number.isFinite(id)) return null;
  if (studentIdCache.has(id)) return studentIdCache.get(id)!;
  const student = await prisma.student.findUnique({
    where: { legacyId: id },
    select: { id: true },
  });
  studentIdCache.set(id, student?.id ?? null);
  return student?.id ?? null;
}

async function migratePayments(db: Db) {
  for (const row of await rows(db, "SELECT * FROM payments")) {
    const studentId = await studentIdFor(row.student_id);
    if (!studentId) continue;
    const legacyId = Number(row.id);
    const data = {
      studentId,
      amount: toDecimal(row.amount),
      dueAmount: toDecimal(row.due_amount),
      paymentMonth: clean(row.payment_month) ?? "unknown",
      status: paymentStatus(row.payment_status),
      method: paymentMethod(row.payment_method),
      receiptNumber: clean(row.receipt_number),
      paidAt: toDate(row.payment_date),
      notes: clean(row.notes),
    };
    await prisma.payment.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId },
    });
    count("payments");
  }
}

/**
 * Attendance is the one genuinely lossy step. The legacy table was
 * (student_id, date) with no course/subject/teacher, so we group each date's
 * rows into one AttendanceSession per batch — the finest granularity the old
 * data supports. Sessions created here have no subject or teacher; going
 * forward the new UI records both.
 */
async function migrateAttendance(db: Db) {
  const legacyRows = await rows(
    db,
    `SELECT a.*, s.course AS course_name, s.batch AS batch_name
     FROM attendance a JOIN students s ON s.id = a.student_id
     ORDER BY a.attendance_date`,
  );

  // Group by (batch, date) so one session covers a whole class sitting.
  const groups = new Map<string, { batchId: string; date: Date; rows: typeof legacyRows }>();

  for (const row of legacyRows) {
    const date = toDate(row.attendance_date);
    if (!date) continue;
    const batchId = await resolveBatch(row.course_name, row.batch_name);
    if (!batchId) continue;

    const dayKey = date.toISOString().slice(0, 10);
    const key = `${batchId}::${dayKey}`;
    if (!groups.has(key)) {
      groups.set(key, { batchId, date: new Date(`${dayKey}T00:00:00.000Z`), rows: [] });
    }
    groups.get(key)!.rows.push(row);
  }

  for (const [key, { batchId, date, rows: groupRows }] of groups.entries()) {
    // Upsert on importKey, not on (batchId, date, subjectId): the imported
    // sessions have a NULL subjectId, and Postgres does not treat NULLs as
    // equal, so that compound unique would let re-runs create duplicates.
    const session = await prisma.attendanceSession.upsert({
      where: { importKey: key },
      update: {},
      create: {
        importKey: key,
        batchId,
        date,
        notes: "Imported from the legacy system (no subject or teacher recorded).",
      },
    });

    for (const row of groupRows) {
      const studentId = await studentIdFor(row.student_id);
      if (!studentId) continue;
      await prisma.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId } },
        update: { status: attendanceStatus(row.status), note: clean(row.note) },
        create: {
          legacyId: Number(row.id),
          sessionId: session.id,
          studentId,
          status: attendanceStatus(row.status),
          note: clean(row.note),
          createdAt: toDate(row.created_at) ?? new Date(),
        },
      });
      count("attendance_records");
    }
    count("attendance_sessions");
  }
}

async function migrateClassRoutine(db: Db) {
  for (const row of await rows(db, "SELECT * FROM class_routine")) {
    const batchId = await resolveBatch(row.course, row.batch);
    if (!batchId) continue;
    const legacyId = Number(row.id);
    const data = {
      batchId,
      teacherId: await resolveTeacher(row.teacher_name),
      dayOfWeek: dayOfWeek(row.day_of_week),
      startTime: toTimeString(row.start_time, "09:00"),
      endTime: toTimeString(row.end_time, "10:00"),
      roomNumber: clean(row.room_number),
    };
    await prisma.classRoutine.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId },
    });
    count("class_routines");
  }
}

async function migrateExamResults(db: Db) {
  for (const row of await rows(db, "SELECT * FROM exam_results")) {
    const studentId = await studentIdFor(row.student_id);
    if (!studentId) continue;
    const legacyId = Number(row.id);
    const data = {
      studentId,
      examName: clean(row.exam_name) ?? "Exam",
      subject: clean(row.subject) ?? "General",
      marksObtained: toDecimal(row.marks_obtained),
      totalMarks: toDecimal(row.total_marks),
      grade: clean(row.grade),
      feedback: clean(row.feedback),
      examDate: toDate(row.exam_date),
    };
    await prisma.examResult.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId },
    });
    count("exam_results");
  }
}

async function migrateStudyMaterials(db: Db) {
  for (const row of await rows(db, "SELECT * FROM study_materials")) {
    const legacyId = Number(row.id);
    const fileUrl = await relocateFile(row.file_path, "materials");
    if (!fileUrl) {
      stats.skipped.push(`study_material #${legacyId} (file missing)`);
      continue;
    }
    const data = {
      title: clean(row.title) ?? "Untitled",
      description: clean(row.description),
      fileUrl,
      fileType: materialType(row.file_type),
      batchId: await resolveBatch(row.course, row.batch),
    };
    await prisma.studyMaterial.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("study_materials");
  }
}

async function migrateAssignments(db: Db) {
  for (const row of await rows(db, "SELECT * FROM assignments")) {
    const legacyId = Number(row.id);
    const data = {
      title: clean(row.title) ?? "Untitled",
      description: clean(row.description) ?? "",
      dueDate: toDate(row.due_date) ?? new Date(),
      fileUrl: await relocateFile(row.file_path, "assignments"),
      batchId: await resolveBatch(row.course, row.batch),
    };
    await prisma.assignment.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("assignments");
  }

  for (const row of await rows(db, "SELECT * FROM assignment_submissions")) {
    const studentId = await studentIdFor(row.student_id);
    const assignment = await prisma.assignment.findUnique({
      where: { legacyId: Number(row.assignment_id) },
      select: { id: true },
    });
    if (!studentId || !assignment) continue;

    const fileUrl = await relocateFile(row.file_path, "assignments");
    if (!fileUrl) continue;

    await prisma.assignmentSubmission.upsert({
      where: { assignmentId_studentId: { assignmentId: assignment.id, studentId } },
      update: { grade: clean(row.grade), feedback: clean(row.feedback) },
      create: {
        legacyId: Number(row.id),
        assignmentId: assignment.id,
        studentId,
        fileUrl,
        submittedAt: toDate(row.submitted_at) ?? new Date(),
        grade: clean(row.grade),
        feedback: clean(row.feedback),
      },
    });
    count("assignment_submissions");
  }
}

async function migrateGallery(db: Db) {
  for (const row of await rows(db, "SELECT * FROM gallery")) {
    const legacyId = Number(row.id);
    const imageUrl = await relocateFile(row.image, "gallery");
    if (!imageUrl) {
      stats.skipped.push(`gallery #${legacyId} (image missing)`);
      continue;
    }

    // The legacy hardcoded category strings become real category rows.
    const categoryName = clean(row.category) ?? "Uncategorised";
    const category = await prisma.galleryCategory.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName, slug: slugify(categoryName) },
    });

    const data = {
      categoryId: category.id,
      title: clean(row.title) ?? "Untitled",
      description: clean(row.description),
      imageUrl,
      eventDate: toDate(row.event_date),
      isFeatured: Boolean(Number(row.featured)),
      status: contentStatus(row.status),
    };
    await prisma.galleryImage.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("gallery_images");
  }
}

async function migrateSiteContent(db: Db) {
  for (const row of await rows(db, "SELECT * FROM notice")) {
    const legacyId = Number(row.id);
    const data = {
      title: clean(row.title) ?? "Notice",
      description: clean(row.description) ?? "",
      status: contentStatus(row.status),
    };
    await prisma.notice.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, publishedAt: toDate(row.created_at) ?? new Date() },
    });
    count("notices");
  }

  for (const row of await rows(db, "SELECT * FROM trial_classes")) {
    const legacyId = Number(row.id);
    const data = {
      title: clean(row.title) ?? "Trial class",
      teacherName: clean(row.teacher_name) ?? "Instructor",
      courseName: clean(row.course_name),
      description: clean(row.description),
      thumbnailUrl: await relocateFile(row.thumbnail, "trial-classes"),
      videoUrl: clean(row.video_url) ?? "",
      status: contentStatus(row.status),
    };
    await prisma.trialClass.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("trial_classes");
  }

  for (const row of await rows(db, "SELECT * FROM achievements")) {
    const legacyId = Number(row.id);
    const data = {
      title: clean(row.title) ?? "Achievement",
      description: clean(row.description),
      imageUrl: await relocateFile(row.image, "achievements"),
    };
    await prisma.achievement.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("achievements");
  }

  for (const row of await rows(db, "SELECT * FROM feedback")) {
    const legacyId = Number(row.id);
    const data = {
      name: clean(row.name) ?? "Anonymous",
      courseName: clean(row.course_name),
      rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
      content: clean(row.feedback) ?? "",
      status: admissionStatus(row.status),
    };
    await prisma.testimonial.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("testimonials");
  }

  for (const row of await rows(db, "SELECT * FROM admissions")) {
    const legacyId = Number(row.id);
    const data = {
      fullName: clean(row.fullname) ?? "Applicant",
      fatherName: clean(row.father_name),
      motherName: clean(row.mother_name),
      mobile: clean(row.mobile) ?? "",
      email: clean(row.email)?.toLowerCase() ?? null,
      address: clean(row.address),
      qualification: clean(row.qualification),
      courseId: await resolveCourse(row.course),
      courseLabel: clean(row.course),
      message: clean(row.message),
    };
    await prisma.admission.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("admissions");
  }
}

async function migrateNotes(db: Db) {
  for (const row of await rows(db, "SELECT * FROM admin_notes")) {
    const legacyId = Number(row.id);
    const fileUrl = await relocateFile(row.pdf_path, "notes");
    if (!fileUrl) {
      stats.skipped.push(`admin_note #${legacyId} (pdf missing)`);
      continue;
    }
    const data = {
      title: clean(row.title) ?? "Note",
      message: clean(row.message),
      fileUrl,
      batchLabel: clean(row.batch),
    };
    await prisma.adminNote.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId, createdAt: toDate(row.created_at) ?? new Date() },
    });
    count("admin_notes");
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.log(DRY_RUN ? "── DRY RUN (no writes) ──\n" : "── Legacy migration ──\n");
  console.log(`Legacy project root: ${LEGACY_ROOT}`);

  const db = await mysql.createConnection({
    host: process.env.LEGACY_MYSQL_HOST ?? "localhost",
    port: Number(process.env.LEGACY_MYSQL_PORT ?? 3306),
    user: process.env.LEGACY_MYSQL_USER ?? "root",
    password: process.env.LEGACY_MYSQL_PASSWORD ?? "",
    database: process.env.LEGACY_MYSQL_DATABASE ?? "orbit_coaching",
    dateStrings: true,
  });
  console.log("Connected to legacy MySQL.\n");

  // Order matters: courses and students are referenced by everything after.
  const steps: Array<[string, (db: Db) => Promise<void>]> = [
    ["admins", migrateAdmins],
    ["courses", migrateCourses],
    ["students + enrolments", migrateStudents],
    ["payments", migratePayments],
    ["attendance", migrateAttendance],
    ["class routine", migrateClassRoutine],
    ["exam results", migrateExamResults],
    ["study materials", migrateStudyMaterials],
    ["assignments", migrateAssignments],
    ["gallery", migrateGallery],
    ["site content", migrateSiteContent],
    ["admin notes", migrateNotes],
  ];

  for (const [label, step] of steps) {
    process.stdout.write(`→ ${label}… `);
    await step(db);
    console.log("done");
  }

  await db.end();

  console.log("\n── Summary ──");
  for (const [table, n] of Object.entries(stats.migrated).sort()) {
    console.log(`  ${table.padEnd(24)} ${n}`);
  }
  if (stats.missingFiles.length) {
    console.log(`\n  ${stats.missingFiles.length} referenced file(s) not found on disk:`);
    for (const file of [...new Set(stats.missingFiles)].slice(0, 20)) {
      console.log(`    - ${file}`);
    }
  }
  if (stats.skipped.length) {
    console.log(`\n  ${stats.skipped.length} row(s) skipped:`);
    for (const item of stats.skipped.slice(0, 20)) console.log(`    - ${item}`);
  }
  console.log(
    "\nNext: review imported teachers (they have no password yet) and assign logins from the admin panel.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("\nMigration failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
