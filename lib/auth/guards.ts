import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { readSession, destroySession, type SessionUser } from './session';

/**
 * Server-side authorisation.
 *
 * Every protected page and route handler calls one of these. Hiding a link is
 * not access control: a student who types /admin/students must be refused by the
 * server, not by the absence of a menu item.
 *
 * The cookie says who the user claims to be; these functions ask the database
 * what that account may currently do. So locking an admin, deactivating a
 * guardian or deleting a student takes effect on their next request rather than
 * whenever their session happens to expire — the same rule
 * orbit_admin_account(), student_auth.php and guardian_auth.php enforce.
 *
 * The status conditions below are copied from those files, including where they
 * are NOT symmetric. In particular a student's `status` column is deliberately
 * not tested, because student_auth.php does not test it either.
 */

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/* --------------------------------------------------------------- resolution */

export interface StudentAccount {
  id: number;
  student_id_no: string | null;
  name: string;
  name_bn: string | null;
  phone: string;
  email: string;
  course: string;
  batch: string | null;
  /** Needed by the audience scope: the legacy batch link. */
  batch_id: number | null;
  branch_id: number | null;
  image: string;
  student_status: string;
  loginId: number;
  username: string;
  mustChangePassword: boolean;
}

export interface TeacherAccount {
  id: number;
  name: string;
  name_bn: string | null;
  email: string;
  photo: string | null;
}

export interface GuardianAccount {
  id: number;
  name: string;
  displayName: string;
  phone: string;
  mustChangePassword: boolean;
}

export interface AdminAccount {
  id: number;
  name: string | null;
  email: string;
  role: 'super_admin' | 'branch_admin';
  branch_id: number | null;
}

/**
 * Ends a session whose account no longer qualifies.
 *
 * Callers follow it with redirect() themselves rather than having this do both:
 * redirect() returns `never`, and TypeScript only narrows on a direct call, so
 * hiding it inside an async helper would silently lose the guarantee that
 * nothing below the check runs.
 */
async function endSession(): Promise<void> {
  await destroySession();
}

/* ------------------------------------------------------------------ student */

/**
 * The signed-in student, loaded fresh from the database.
 *
 * Mirrors student_auth.php: students JOIN student_login, newest login row first.
 * A student whose record or login row was deleted is signed out rather than
 * shown stale data.
 */
export async function requireStudent(): Promise<StudentAccount> {
  const session = await readSession();
  if (!session || session.role !== 'student') redirect('/student/login');

  const login = await prisma.studentLogin.findFirst({
    where: { student_id: session.uid },
    orderBy: { id: 'desc' },
    select: {
      id: true,
      username: true,
      must_change_password: true,
      student: {
        select: {
          id: true,
          student_id_no: true,
          name: true,
          name_bn: true,
          phone: true,
          email: true,
          course: true,
          batch: true,
          batch_id: true,
          branch_id: true,
          image: true,
          student_status: true,
        },
      },
    },
  });

  if (!login) {
    await endSession();
    redirect('/student/login');
  }

  const s = login.student;
  return {
    id: s.id,
    student_id_no: s.student_id_no,
    name: s.name,
    name_bn: s.name_bn,
    phone: s.phone,
    email: s.email,
    course: s.course,
    batch: s.batch,
    batch_id: s.batch_id,
    branch_id: s.branch_id,
    image: s.image,
    student_status: s.student_status,
    loginId: login.id,
    username: login.username,
    mustChangePassword: login.must_change_password,
  };
}

/**
 * The first-login rule from student_auth.php: while the temporary password
 * issued at approval is still in use, every page except settings and logout
 * sends the student to settings to choose their own password.
 *
 * Pages call this instead of requireStudent(); the two settings pages call
 * requireStudent() directly so the redirect cannot loop.
 */
export async function requireStudentUnlocked(): Promise<StudentAccount> {
  const student = await requireStudent();
  if (student.mustChangePassword) redirect('/student/settings?first=1');
  return student;
}

/* ------------------------------------------------------------------ teacher */

/** Signed-in teacher. status must still be 'active'. */
export async function requireTeacher(): Promise<TeacherAccount> {
  const session = await readSession();
  if (!session || session.role !== 'teacher') redirect('/teacher/login');

  const teacher = await prisma.teacher.findFirst({
    where: { id: session.uid, status: 'active' },
    select: { id: true, name: true, name_bn: true, email: true, photo: true },
  });
  if (!teacher) {
    await endSession();
    redirect('/teacher/login');
  }

  return teacher;
}

/* ----------------------------------------------------------------- guardian */

/** Signed-in guardian. A deactivated account is signed out, not shown data. */
export async function requireGuardian(): Promise<GuardianAccount> {
  const session = await readSession();
  if (!session || session.role !== 'guardian') redirect('/guardian/login');

  const guardian = await prisma.guardian.findFirst({
    where: { id: session.uid, status: 'active' },
    select: { id: true, name: true, phone: true, must_change_password: true },
  });
  if (!guardian) {
    await endSession();
    redirect('/guardian/login');
  }

  const { formatBdPhone } = await import('./phone');
  const name = (guardian.name ?? '').trim();
  return {
    id: guardian.id,
    name,
    // orbit_guardian_display_name(): their name, else the formatted phone.
    displayName: name !== '' ? name : formatBdPhone(guardian.phone),
    phone: guardian.phone,
    mustChangePassword: guardian.must_change_password,
  };
}

/** The same first-login rule guardian_auth.php applies. */
export async function requireGuardianUnlocked(): Promise<GuardianAccount> {
  const guardian = await requireGuardian();
  if (guardian.mustChangePassword) redirect('/guardian/settings?first=1');
  return guardian;
}

/**
 * The guardian's ACTIVE linked children, as orbit_guardian_children() returns
 * them: only student_status 'Active', ordered by name then id.
 */
export async function guardianChildren(guardianId: number) {
  const links = await prisma.guardianStudent.findMany({
    where: { guardian_id: guardianId, student: { student_status: 'Active' } },
    select: {
      relation: true,
      created_at: true,
      student: {
        select: {
          id: true,
          name: true,
          name_bn: true,
          course: true,
          batch: true,
          batch_id: true,
          roll_number: true,
          student_id_no: true,
          branch_id: true,
          image: true,
        },
      },
    },
    orderBy: [{ student: { name: 'asc' } }, { student: { id: 'asc' } }],
  });
  return links.map((l) => ({ ...l.student, relation: l.relation, linked_at: l.created_at }));
}

/**
 * Resolves ?student=<id> against the guardian's own children.
 *
 * guardian_auth.php's rule, and the one that stops a guardian reading another
 * family's child by editing the URL: an id that is not in their list is a 404,
 * not an error that admits the student exists.
 */
export type GuardianChild = Awaited<ReturnType<typeof guardianChildren>>[number];

export async function requireGuardianChild(
  guardianId: number,
  requested: string | undefined
): Promise<{ children: GuardianChild[]; child: GuardianChild | null }> {
  const children = await guardianChildren(guardianId);

  if (requested !== undefined && requested !== '') {
    const wanted = /^\d+$/.test(requested) ? Number(requested) : 0;
    const match = children.find((c) => c.id === wanted) ?? null;
    if (!match) throw new NotFoundError();
    return { children, child: match };
  }

  return { children, child: children[0] ?? null };
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/* -------------------------------------------------------------------- admin */

/**
 * Any active admin — super or branch-restricted.
 *
 * Applies orbit_admin_account()'s last rule: a branch_admin with no branch_id is
 * treated as locked. Without it their branch filter would match nothing, which
 * a naive implementation turns into "no filter" — i.e. every branch.
 */
export async function requireAdmin(): Promise<AdminAccount> {
  const session = await readSession();
  if (!session || session.role !== 'admin') redirect('/admin/login');

  const admin = await prisma.admin.findFirst({
    where: { id: session.uid, status: 'active' },
    select: { id: true, name: true, email: true, role: true, branch_id: true },
  });
  if (!admin) {
    await endSession();
    redirect('/admin/login');
  }
  if (admin.role === 'branch_admin' && !admin.branch_id) {
    await endSession();
    redirect('/admin/login');
  }

  return admin;
}

/**
 * Institute-wide pages: fees, branches, admins, settings, reports.
 *
 * The original calls orbit_admin_require_super() on top of the normal gate for
 * exactly these; a branch admin must not see another branch's money.
 */
export async function requireSuperAdmin(): Promise<AdminAccount> {
  const admin = await requireAdmin();
  if (admin.role !== 'super_admin') throw new ForbiddenError('Super admin only');
  return admin;
}

/**
 * The Admin → Admins page, which only the developer's address may open.
 *
 * ORBIT_DEVELOPER_EMAIL is read from the environment and deliberately NOT from
 * site_settings: an admin can edit every setting, so a setting would let them
 * hand the page straight back to themselves. When no developer address is
 * configured the page is open to super admins, as orbit_admin_may_manage_admins()
 * behaves.
 */
export async function requireDeveloper(): Promise<AdminAccount> {
  const admin = await requireSuperAdmin();
  const developer = (process.env.ORBIT_DEVELOPER_EMAIL ?? '').trim().toLowerCase();
  if (developer !== '' && admin.email.trim().toLowerCase() !== developer) {
    throw new ForbiddenError('Developer only');
  }
  return admin;
}

/* ------------------------------------------------------------------- branch */

/**
 * The branch an admin is pinned to, or 0 for an all-branch admin.
 * Every list query for a branch-tagged table must narrow on this.
 */
export async function adminBranchLock(): Promise<number> {
  const admin = await requireAdmin();
  return admin.role === 'branch_admin' && admin.branch_id ? admin.branch_id : 0;
}

/**
 * A Prisma `where` fragment for a branch-tagged table.
 *
 * `shared` mirrors orbit_branch_where()'s flag: lists pass true so a branch
 * admin also sees rows shared across branches (branch_id NULL); writes pass
 * false so those shared rows stay read-only to them.
 */
export type BranchFilter =
  | Record<string, never>
  | { branch_id: number }
  | { OR: [{ branch_id: number }, { branch_id: null }] };

export async function branchWhere(shared = true): Promise<BranchFilter> {
  const lock = await adminBranchLock();
  if (lock === 0) return {};
  return shared ? { OR: [{ branch_id: lock }, { branch_id: null }] } : { branch_id: lock };
}

/**
 * Refuses when a record belongs to another branch.
 *
 * The original keeps a hard-coded list of branch-tagged tables and refuses any
 * table it does not know — "unknown table: refuse rather than guess". The same
 * rule is kept here, so forgetting to register a new table fails closed instead
 * of leaking it.
 */
const BRANCH_TAGGED = {
  students: (id: number) => prisma.student.findUnique({ where: { id }, select: { branch_id: true } }),
  batches: (id: number) => prisma.batch.findUnique({ where: { id }, select: { branch_id: true } }),
  notice: (id: number) => prisma.notice.findUnique({ where: { id }, select: { branch_id: true } }),
  class_routine: (id: number) =>
    prisma.classRoutine.findUnique({ where: { id }, select: { branch_id: true } }),
  assignments: (id: number) =>
    prisma.assignment.findUnique({ where: { id }, select: { branch_id: true } }),
  study_materials: (id: number) =>
    prisma.studyMaterial.findUnique({ where: { id }, select: { branch_id: true } }),
  live_classes: (id: number) =>
    prisma.liveClass.findUnique({ where: { id }, select: { branch_id: true } }),
  recorded_classes: (id: number) =>
    prisma.recordedClass.findUnique({ where: { id }, select: { branch_id: true } }),
  exams: (id: number) => prisma.exam.findUnique({ where: { id }, select: { branch_id: true } }),
  attendance: (id: number) =>
    prisma.attendance.findUnique({ where: { id }, select: { branch_id: true } }),
  payments: (id: number) => prisma.payment.findUnique({ where: { id }, select: { branch_id: true } }),
  admissions: (id: number) =>
    prisma.admission.findUnique({ where: { id }, select: { branch_id: true } }),

  // These carry no branch column of their own; the branch is the student's, as
  // orbit_admin_can_record()'s $viaStudent list resolves it.
  exam_results: (id: number) =>
    prisma.examResult
      .findUnique({ where: { id }, select: { student: { select: { branch_id: true } } } })
      .then((r) => (r ? { branch_id: r.student.branch_id } : null)),
  enrollments: (id: number) =>
    prisma.enrollment
      .findUnique({ where: { id }, select: { student: { select: { branch_id: true } } } })
      .then((r) => (r ? { branch_id: r.student.branch_id } : null)),
  assignment_submissions: (id: number) =>
    prisma.assignmentSubmission
      .findUnique({ where: { id }, select: { student: { select: { branch_id: true } } } })
      .then((r) => (r ? { branch_id: r.student.branch_id } : null)),
} as const;

export type BranchTaggedTable = keyof typeof BRANCH_TAGGED;

export async function requireRecordBranch(
  table: BranchTaggedTable,
  id: number,
  shared = true
): Promise<void> {
  const lock = await adminBranchLock();
  if (lock === 0 || !Number.isInteger(id) || id <= 0) return;

  const lookup = BRANCH_TAGGED[table];
  if (!lookup) throw new ForbiddenError('Unknown table');

  const row = (await lookup(id)) as { branch_id: number | null } | null;
  if (!row) return; // nothing to leak

  if (row.branch_id === null) {
    // Shared content: visible to everyone, editable only by an all-branch admin.
    if (!shared) throw new ForbiddenError('Shared record is read-only for a branch admin');
    return;
  }
  if (row.branch_id !== lock) throw new ForbiddenError('Record belongs to another branch');
}

/** The session, without requiring any particular role. */
export async function currentUser(): Promise<SessionUser | null> {
  return readSession();
}
