import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminPage } from '@/components/portal/AdminPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { paginate } from '@/lib/paginate';
import { mailIsConfigured } from '@/lib/email/send';
import { uploadUrl } from '@/lib/storage/url';
import { groupOptions, noteHistory, noteList } from '@/lib/notes/admin';
import { DeleteNote, NoteForm, SendNoteForm } from './NoteForms';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'anote.title'),
    robots: { index: false, follow: false },
  };
}

const MAX_MB = 10;

/**
 * Notes by email, from admin/note_management.php.
 *
 * A note is a PDF tagged with one course or batch **name**: students of that
 * name see it in their portal, and "Send" emails it to the ones who have not had
 * it yet. The sending history below is what makes a repeat send safe to press.
 */
export default async function AdminNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AdminPage active="notes" route="/admin/notes" title="">
      {async ({ t }) => {
        const total = await prisma.adminNote.count().catch(() => 0);
        const pager = paginate(total, 10, Number(params.page ?? 1));

        const [notes, options, history, allNotes] = await Promise.all([
          noteList(pager.perPage, pager.offset),
          groupOptions(t.lang),
          noteHistory(50),
          prisma.adminNote
            .findMany({
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              select: { id: true, title: true, batch: true },
            })
            .catch(() => []),
        ]);

        const editId = /^\d+$/.test(params.edit ?? '') ? Number(params.edit) : 0;
        const editing =
          editId > 0
            ? await prisma.adminNote.findUnique({ where: { id: editId } }).catch(() => null)
            : null;

        const sendId = /^\d+$/.test(params.send ?? '') ? Number(params.send) : 0;
        const sendNote = allNotes.find((note) => note.id === sendId);

        const mailOn = mailIsConfigured();

        const groupLabels = {
          select: t.t('common.select'),
          other: t.t('anote.other_group'),
          recipients: t.t('anote.recipients', { count: '{count}' }),
        };

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-ink-heading">{t.t('anote.title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{t.t('anote.sub')}</p>
              </div>
              <span className="text-sm text-ink-muted">
                {t.t('anote.count', { count: t.digits(total) })}
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <Card>
                  <CardHeader
                    title={t.t(editing ? 'anote.edit' : 'anote.create')}
                    icon="bi-file-earmark-pdf"
                  />
                  <CardBody>
                    <NoteForm
                      values={{
                        id: editing?.id ?? 0,
                        title: editing?.title ?? '',
                        message: editing?.message ?? '',
                        batch: editing?.batch ?? '',
                        pdfPath: editing?.pdf_path ?? '',
                        pdfHref: editing ? uploadUrl(editing.pdf_path) : '',
                      }}
                      groups={options.groups}
                      other={options.other}
                      cancelHref="/admin/notes"
                      labels={{
                        ...groupLabels,
                        title: t.t('common.title'),
                        titlePlaceholder: t.t('anote.title_ph'),
                        group: t.t('anote.group'),
                        groupHint: t.t('anote.group_hint'),
                        message: t.t('anote.message'),
                        messagePlaceholder: t.t('anote.message_ph'),
                        pdf: t.t('anote.pdf'),
                        pdfHint: t.t('anote.pdf_hint', { size: t.digits(MAX_MB) }),
                        replacePdf: t.t('anote.replace_pdf'),
                        openPdf: t.t('anote.open_pdf'),
                        upload: t.t('anote.upload'),
                        save: t.t('common.save'),
                        saving: t.t('common.please_wait'),
                        cancel: t.t('common.cancel'),
                      }}
                    />
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-6 xl:col-span-2">
                <Card>
                  <CardHeader
                    title={t.t('anote.send_title')}
                    icon="bi-envelope-paper"
                  />
                  <CardBody>
                    <SendNoteForm
                      notes={allNotes.map((note) => ({
                        id: note.id,
                        label: `${note.title} — ${note.batch}`,
                        batch: note.batch,
                      }))}
                      initialNote={sendNote?.id ?? 0}
                      initialGroup={sendNote?.batch ?? ''}
                      groups={options.groups}
                      other={options.other}
                      mailOn={mailOn}
                      labels={{
                        ...groupLabels,
                        sub: t.t('anote.send_sub'),
                        note: t.t('anote.note'),
                        sendTo: t.t('anote.send_to'),
                        pickGroup: t.t('anote.pick_group'),
                        send: t.t('anote.send'),
                        sending: t.t('anote.sending'),
                        confirm: t.t('anote.send_confirm'),
                        cancel: t.t('common.cancel'),
                        mailOff: t.t('mail.not_configured'),
                      }}
                    />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t.t('anote.list_title')} icon="bi-journal-richtext" />

                  {notes.length === 0 ? (
                    <EmptyState
                      icon="bi-journal-x"
                      title={t.t('anote.none')}
                      body={t.t('anote.sub')}
                    />
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {notes.map((note) => (
                        <li key={note.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink-heading">{note.title}</span>
                                <Badge tone="neutral">{note.batch}</Badge>
                                {note.sentCount > 0 && (
                                  <Badge tone="info">
                                    {t.t('anote.sent_to')}: {t.digits(note.sentCount)}
                                  </Badge>
                                )}
                              </p>

                              {(note.message ?? '').trim() !== '' && (
                                <p className="mt-1 text-sm text-ink-muted">{note.message}</p>
                              )}

                              <p className="mt-1 text-xs text-ink-muted">
                                {[
                                  t.date(note.created_at, 'd M Y'),
                                  note.adminEmail !== ''
                                    ? t.t('elog.by', { email: note.adminEmail })
                                    : '',
                                ]
                                  .filter((part) => part !== '')
                                  .join(' · ')}
                              </p>
                            </div>

                            <span className="flex flex-wrap items-center gap-1.5">
                              <a
                                href={uploadUrl(note.pdf_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t.t('anote.open_pdf')}
                                aria-label={t.t('anote.open_pdf')}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                <i className="bi bi-file-earmark-pdf" aria-hidden />
                              </a>
                              <Link
                                href={`/admin/notes?send=${note.id}#sendNote`}
                                className="rounded-orbit bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-hover"
                              >
                                <i className="bi bi-envelope me-1" aria-hidden />
                                {t.t('anote.send')}
                              </Link>
                              <Link
                                href={`/admin/notes?edit=${note.id}#noteForm`}
                                title={t.t('common.edit')}
                                aria-label={t.t('common.edit')}
                                className="rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2"
                              >
                                <i className="bi bi-pencil" aria-hidden />
                              </Link>
                              <DeleteNote
                                noteId={note.id}
                                title={note.title}
                                labels={{
                                  remove: t.t('common.delete'),
                                  confirm: t.t('anote.delete_confirm', { title: '{title}' }),
                                  cancel: t.t('common.cancel'),
                                }}
                              />
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {pager.totalPages > 1 && (
                    <CardBody>
                      <Pagination
                        page={pager.page}
                        totalPages={pager.totalPages}
                        hrefFor={(page) =>
                          `/admin/notes${page > 1 ? `?page=${page}` : ''}`
                        }
                        labels={{
                          previous: t.t('common.previous'),
                          next: t.t('common.next'),
                          pageOf: t.t('gallery.page_of'),
                        }}
                        format={t.digits}
                      />
                    </CardBody>
                  )}
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader
                title={t.t('anote.history')}
                subtitle={t.t('anote.history_sub')}
                icon="bi-clock-history"
              />

              {history.length === 0 ? (
                <CardBody className="text-sm text-ink-muted">{t.t('anote.history_none')}</CardBody>
              ) : (
                <ul className="divide-y divide-line-soft text-sm">
                  {history.map((log) => (
                    <li key={log.id} className="flex flex-wrap items-center gap-2 px-5 py-2">
                      <Badge tone={log.status === 'sent' ? 'success' : 'danger'}>
                        {t.t(log.status === 'sent' ? 'anote.log_sent' : 'anote.log_failed')}
                      </Badge>
                      <span className="text-ink">{log.studentName}</span>
                      <span className="text-ink-muted">{log.student_email}</span>
                      <span className="text-ink-muted">· {log.noteTitle}</span>
                      <span className="ms-auto text-xs text-ink-muted">
                        {t.date(log.sent_at, 'd M Y, h:i A')}
                      </span>
                      {log.status !== 'sent' && (log.error_message ?? '') !== '' && (
                        <span className="w-full text-xs text-red-600">{log.error_message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </AdminPage>
  );
}
