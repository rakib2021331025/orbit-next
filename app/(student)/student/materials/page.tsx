import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentMaterials, studentNotes } from '@/lib/student/data';
import { uploadUrl } from '@/lib/storage/url';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'student.materials.title'),
    robots: { index: false, follow: false },
  };
}

/** A Bootstrap icon per file type, so a list of ten files is scannable. */
function fileIcon(type: string): string {
  const map: Record<string, string> = {
    pdf: 'bi-file-earmark-pdf',
    doc: 'bi-file-earmark-word',
    docx: 'bi-file-earmark-word',
    xls: 'bi-file-earmark-spreadsheet',
    xlsx: 'bi-file-earmark-spreadsheet',
    ppt: 'bi-file-earmark-slides',
    pptx: 'bi-file-earmark-slides',
    zip: 'bi-file-earmark-zip',
    jpg: 'bi-file-earmark-image',
    jpeg: 'bi-file-earmark-image',
    png: 'bi-file-earmark-image',
  };
  return map[type.toLowerCase()] ?? 'bi-file-earmark';
}

/**
 * Study material for the student's courses, from student/materials.php.
 *
 * Some older rows hold a link to a shared drive rather than an uploaded file;
 * `uploadUrl` passes an http(s) value through, which is why both work here.
 */
export default async function StudentMaterialsPage() {
  return (
    <StudentPage
      active="materials"
      title={(t) => t.t('student.materials.title')}
      subtitle={(t) => t.t('student.materials.sub')}
    >
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const [materials, notes] = await Promise.all([
          studentMaterials(scope, 200),
          studentNotes(scope, 100),
        ]);

        if (materials.length === 0 && notes.length === 0) {
          return (
            <Card>
              <EmptyState
                icon="bi-folder-x"
                title={t.t('student.materials.title')}
                body={t.t('student.materials.none')}
              />
            </Card>
          );
        }

        return (
          <div className="space-y-6">
          {materials.length > 0 && (
          <Card>
            <CardHeader
              title={t.t('student.materials.files')}
              icon="bi-folder2-open"
              actions={<Badge tone="neutral">{t.digits(materials.length)}</Badge>}
            />
            <ul className="divide-y divide-line-soft">
              {materials.map((row) => {
                const href = uploadUrl(row.file_path);
                return (
                  <li key={row.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                    <i
                      className={`bi ${fileIcon(row.file_type)} mt-0.5 text-lg text-ink-muted`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{row.title}</p>
                      {row.description && (
                        <p className="mt-0.5 text-sm text-ink-muted">{row.description}</p>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span>{t.date(row.created_at, 'd M Y')}</span>
                        {row.course && <span>{row.course}</span>}
                        {row.batch && <span>{row.batch}</span>}
                      </p>
                    </div>
                    {href !== '' && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                      >
                        <i className="bi bi-download me-1.5" aria-hidden />
                        {t.t('common.download')}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          )}

          {notes.length > 0 && (
            <Card>
              <CardHeader
                title={t.t('student.materials.notes')}
                icon="bi-journal-richtext"
                actions={<Badge tone="neutral">{t.digits(notes.length)}</Badge>}
              />
              <ul className="divide-y divide-line-soft" id="notes">
                {notes.map((note) => {
                  const href = uploadUrl(note.pdf_path);
                  return (
                    <li key={note.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                      <i
                        className="bi bi-file-earmark-pdf mt-0.5 text-lg text-ink-muted"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{note.title}</p>
                        {(note.message ?? '').trim() !== '' && (
                          <p className="mt-0.5 text-sm text-ink-muted">{note.message}</p>
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                          <span>{t.date(note.created_at, 'd M Y')}</span>
                          <span>{note.batch}</span>
                        </p>
                      </div>
                      {href !== '' && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-orbit border border-line px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-2"
                        >
                          <i className="bi bi-download me-1.5" aria-hidden />
                          {t.t('common.download')}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          </div>
        );
      }}
    </StudentPage>
  );
}
