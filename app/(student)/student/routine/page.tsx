import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate, TEACHING_WEEK, todayName } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentRoutine } from '@/lib/student/data';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.nav.routine'),
    robots: { index: false, follow: false },
  };
}

/**
 * The weekly class routine, from student/routine.php.
 *
 * Grouped by day, Saturday first — the Bangladeshi teaching week. `day_of_week`
 * stores English names ("Saturday") whatever the interface language, so the
 * comparison is against those and the label is translated for display.
 */
export default async function StudentRoutinePage() {
  return (
    <StudentPage
      active="routine"
      title={(t) => t.t('student.routine.title')}
      subtitle={undefined}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const routine = await studentRoutine(scope);

        const today = todayName();

        const byDay = TEACHING_WEEK.map((day) => ({
          day,
          label: t.day(day),
          today: day === today,
          classes: routine
            .filter((row) => row.day_of_week.toLowerCase() === day.toLowerCase())
            .sort((a, b) => a.start_time.getTime() - b.start_time.getTime()),
        }));

        if (routine.length === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-calendar-x"
                title={t.t('student.routine.title')}
                body={t.t('student.routine.none')}
              />
            </Card>
          );
        }

        return (
          <div className="space-y-5">
            {byDay
              // A day with no classes is not shown at all — seven empty cards
              // tell the student nothing.
              .filter((entry) => entry.classes.length > 0)
              .map((entry) => (
                <Card key={entry.day}>
                  <CardHeader
                    title={entry.label}
                    icon="bi-calendar-week"
                    actions={entry.today ? <Badge tone="success">{t.t('common.today')}</Badge> : undefined}
                  />
                  <ul className="divide-y divide-line-soft">
                    {entry.classes.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="w-36 shrink-0 text-sm tabular-nums text-ink-muted">
                          {t.date(row.start_time, 'h:i A')} – {t.date(row.end_time, 'h:i A')}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{row.subject}</span>
                          <span className="block text-xs text-ink-muted">
                            {[row.teacher_name, row.room_number, row.batch].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
          </div>
        );
      }}
    </StudentPage>
  );
}
