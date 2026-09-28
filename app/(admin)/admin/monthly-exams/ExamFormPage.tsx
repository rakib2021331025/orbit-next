import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPage } from '@/components/portal/AdminPage';
import { prisma } from '@/lib/db/prisma';
import { branchesEnabled } from '@/lib/branch/active';
import { branchList } from '@/lib/branch/stats';
import { formatMark } from '@/lib/results/grades';
import { examSubjects, subjectMarkInfo } from '@/lib/exams/monthly';
import { ExamForm, type SubjectRow } from './ExamForms';

/**
 * The exam settings form, shared by "create" and "edit".
 *
 * One component for both because the only difference is what it starts from —
 * a blank exam for this month, or the one being edited with its subjects and
 * which of them already carry marks.
 */
export async function ExamFormPage({ examId }: { examId: number }) {
  return (
    <AdminPage active="monthly_exams" route="/admin/monthly-exams" level="super" title="">
      {async ({ t }) => {
        const exam =
          examId > 0
            ? await prisma.monthlyExam.findUnique({ where: { id: examId } }).catch(() => null)
            : null;
        if (examId > 0 && !exam) notFound();

        const [courses, batches, master, multiBranch, branches] = await Promise.all([
          prisma.course
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true },
            })
            .catch(() => []),
          prisma.batch
            .findMany({
              orderBy: [{ course_id: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
              select: {
                id: true,
                name: true,
                name_bn: true,
                batch_type: true,
                course_id: true,
                branch_id: true,
              },
            })
            .catch(() => []),
          prisma.subject
            .findMany({
              orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
              select: { id: true, name: true, name_bn: true, status: true },
            })
            .catch(() => []),
          branchesEnabled(),
          branchList(),
        ]);

        const subjects = examId > 0 ? await examSubjects(examId) : [];
        const markInfo = await subjectMarkInfo(examId);

        const rows: SubjectRow[] = subjects.map((subject) => ({
          key: `e${subject.id}`,
          id: subject.id,
          subjectId: subject.subject_id ?? 0,
          name: subject.subject_name,
          nameBn: subject.subject_name_bn ?? '',
          // Marks are shown in Latin digits: this is a number being edited, not
          // a number being read.
          full: formatMark(Number(subject.full_marks), String),
          pass: formatMark(Number(subject.pass_marks), String),
          hasMarks: markInfo.has(subject.id),
        }));

        const thisMonth = new Date().toISOString().slice(0, 7);
        const title = t.t(exam ? 'mexam.edit' : 'mexam.create');

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Link
                  href="/admin/monthly-exams"
                  className="text-sm text-primary hover:underline"
                >
                  <i className="bi bi-arrow-left me-1" aria-hidden /> {t.t('mexam.back')}
                </Link>
                <h1 className="mt-1 text-2xl font-bold text-ink-heading">{title}</h1>
              </div>
              {exam && (
                <Link
                  href={`/admin/monthly-exams/${exam.id}/marks`}
                  className="rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                >
                  <i className="bi bi-pencil-square me-1" aria-hidden /> {t.t('mexam.enter_marks')}
                </Link>
              )}
            </div>

            <ExamForm
              values={{
                id: exam?.id ?? 0,
                // The defaults the original starts a new exam with — the common
                // case typed out once.
                title: exam?.title ?? 'Monthly Exam',
                titleBn: exam?.title_bn ?? 'মাসিক পরীক্ষা',
                month: exam?.exam_month ?? thisMonth,
                examDate: exam?.exam_date ? exam.exam_date.toISOString().slice(0, 10) : '',
                courseId: exam?.course_id ?? 0,
                batchId: exam?.batch_id ?? 0,
                showPosition: exam?.show_position ?? true,
                remarks: exam?.remarks ?? '',
                rows,
              }}
              courses={courses.map((course) => ({
                id: course.id,
                label: t.pick(course, 'name'),
              }))}
              batches={batches.map((batch) => ({
                id: batch.id,
                courseId: batch.course_id ?? 0,
                label:
                  `${t.pick(batch, 'name')} (${t.t(`course.type_${batch.batch_type}`)})` +
                  (multiBranch && batch.branch_id
                    ? ` · ${(() => {
                        const branch = branches.find((row) => row.id === batch.branch_id);
                        return branch ? t.pickPair(branch, 'name') : '';
                      })()}`
                    : ''),
              }))}
              master={master.map((subject) => ({
                id: subject.id,
                name: subject.name,
                nameBn: subject.name_bn ?? '',
                active: subject.status === 'active',
                label:
                  t.pick(subject, 'name') +
                  (subject.status !== 'active' ? ` (${t.t('status.inactive')})` : ''),
              }))}
              labels={{
                name: t.t('mexam.name'),
                namePlaceholder: t.t('mexam.name_ph'),
                nameBn: t.t('mexam.name_bn'),
                month: t.t('mexam.month'),
                date: t.t('mexam.date'),
                course: t.t('common.course'),
                noCourse: t.t('mexam.no_course'),
                batch: t.t('common.batch'),
                anyBatch: t.t('mexam.any_batch'),
                batchHint: t.t('mexam.batch_hint'),
                remarks: t.t('mexam.remarks'),
                showPosition: t.t('mexam.show_position'),
                subjects: t.t('mexam.subjects'),
                subjectPick: t.t('mexam.subject_pick'),
                customSubject: t.t('mexam.custom_subject'),
                subjectName: t.t('subj.name'),
                subjectNameBn: t.t('subj.name_bn'),
                fullMarks: t.t('result.full_marks'),
                passMarks: t.t('result.pass_marks'),
                addAll: t.t('mexam.add_all'),
                addSubject: t.t('mexam.add_subject'),
                remove: t.t('mexam.remove'),
                hasMarks: t.t('mexam.has_marks'),
                hasMarksHint: t.t('mexam.err_remove_marked', { subject: t.t('mexam.subject_pick') }),
                passAuto: t.t('mexam.pass_auto'),
                save: t.t('mexam.save'),
                saving: t.t('common.please_wait'),
                cancel: t.t('common.cancel'),
              }}
            />
          </div>
        );
      }}
    </AdminPage>
  );
}
