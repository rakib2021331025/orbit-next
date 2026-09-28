import type { Metadata } from 'next';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { SubjectForm, SubjectRowActions } from './SubjectForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'subj.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The master subject list, from admin/subjects.php.
 *
 * Subjects are institute-wide, not per branch: "Physics" is the same subject at
 * every branch, and a per-branch list would mean the same marksheet column had
 * two different ids.
 */
export default async function AdminSubjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="subjects" route="/admin/subjects" title="">
      {async ({ t }) => {
        const subjects = await prisma.subject
          .findMany({
            orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              name_bn: true,
              code: true,
              sort_order: true,
              status: true,
            },
          })
          .catch(() => []);

        // How many exams use each subject, counted once rather than per row.
        const usage = await prisma.monthlyExamSubject
          .findMany({ select: { subject_id: true, exam_id: true } })
          .catch(() => []);
        const usedBySubject = new Map<number, Set<number>>();
        for (const row of usage) {
          if (row.subject_id === null) continue;
          const set = usedBySubject.get(row.subject_id) ?? new Set<number>();
          set.add(row.exam_id);
          usedBySubject.set(row.subject_id, set);
        }

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing = subjects.find((subject) => subject.id === editId) ?? null;

        // A new subject goes to the end of the list by default.
        const nextSort =
          subjects.length > 0 ? Math.max(...subjects.map((subject) => subject.sort_order)) + 1 : 1;

        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-ink-heading">{t.t('subj.title')}</h1>
              <p className="mt-1 text-sm text-ink-muted">{t.t('subj.sub')}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardBody>
                  <SubjectForm
                    values={{
                      id: editing?.id ?? 0,
                      name: editing?.name ?? '',
                      name_bn: editing?.name_bn ?? '',
                      code: editing?.code ?? '',
                      sort_order: editing?.sort_order ?? nextSort,
                      status: editing?.status ?? 'active',
                    }}
                    labels={{
                      add: t.t('subj.add'),
                      edit: t.t('subj.edit'),
                      name: t.t('subj.name'),
                      nameBn: t.t('subj.name_bn'),
                      code: t.t('subj.code'),
                      sort: t.t('subj.sort'),
                      status: t.t('common.status'),
                      statusActive: t.t('status.active'),
                      statusInactive: t.t('status.inactive'),
                      save: t.t('common.save'),
                      cancelEdit: t.t('subj.cancel_edit'),
                    }}
                  />
                </CardBody>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader title={t.t('subj.title')} icon="bi-list-ol" />

                {subjects.length === 0 ? (
                  <EmptyState icon="bi-list-ol" title={t.t('subj.none')} body={t.t('subj.sub')} />
                ) : (
                  <TableWrap>
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>{t.t('subj.name')}</Th>
                          <Th>{t.t('subj.code')}</Th>
                          <Th alignment="center">{t.t('subj.used')}</Th>
                          <Th alignment="center">{t.t('common.status')}</Th>
                          <Th alignment="end">{t.t('common.actions')}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {subjects.map((subject) => {
                          const used = usedBySubject.get(subject.id)?.size ?? 0;

                          return (
                            <Tr key={subject.id}>
                              <Td>
                                <span className="font-medium text-ink">{subject.name}</span>
                                {subject.name_bn && (
                                  <span className="block text-xs text-ink-muted" lang="bn">
                                    {subject.name_bn}
                                  </span>
                                )}
                              </Td>
                              <Td className="text-xs">{subject.code ?? '—'}</Td>
                              <Td alignment="center" numeric>
                                {t.digits(used)}
                              </Td>
                              <Td alignment="center">
                                <Badge tone={subject.status === 'active' ? 'success' : 'neutral'}>
                                  {t.t(
                                    subject.status === 'active' ? 'status.active' : 'status.inactive'
                                  )}
                                </Badge>
                              </Td>
                              <Td alignment="end">
                                <SubjectRowActions
                                  subjectId={subject.id}
                                  status={subject.status}
                                  usedCount={used}
                                  labels={{
                                    edit: t.t('common.edit'),
                                    activate: t.t('status.active'),
                                    deactivate: t.t('status.inactive'),
                                    remove: t.t('common.delete'),
                                    confirmDelete: t.t('subj.delete_confirm'),
                                    dismiss: t.t('common.cancel'),
                                  }}
                                />
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </TableWrap>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </AdminPage>
  );
}
