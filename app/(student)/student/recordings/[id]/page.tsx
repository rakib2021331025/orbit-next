import type { Metadata } from 'next';
import Link from 'next/link';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { studentScope } from '@/lib/student/scope';
import { studentRecordings } from '@/lib/student/data';
import { driveEmbedUrl } from '@/lib/recordings/drive';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'rec.student_title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Watching one recording, from student/recording_watch.php.
 *
 * **The recording is looked up inside the student's own scope**, not by id alone.
 * A student who edits the URL to another batch's recording gets the not-found
 * state, and the message deliberately does not distinguish "does not exist" from
 * "not yours" — that distinction is itself information.
 *
 * The iframe src is rebuilt from the stored id through `driveEmbedUrl`, which
 * revalidates it, so a row damaged by a direct database edit cannot inject a URL.
 */
export default async function WatchRecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recordingId = /^\d+$/.test(id) ? Number(id) : 0;

  return (
    <StudentPage active="recordings" title={(t) => t.t('rec.student_title')}>
      {async ({ student, t }) => {
        const scope = await studentScope(student);
        const recordings = await studentRecordings(scope, 500);

        // Found only within what this student may watch.
        const recording = recordings.find((row) => row.id === recordingId) ?? null;

        if (!recording) {
          return (
            <Card>
              <EmptyState
                icon="bi-camera-reels"
                title={t.t('rec.not_found_title')}
                body={t.t('rec.not_found_body')}
                action={
                  <Link
                    href="/student/recordings"
                    className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
                  >
                    {t.t('rec.back_to_list')}
                  </Link>
                }
              />
            </Card>
          );
        }

        const embed = driveEmbedUrl(recording.drive_file_id);

        return (
          <div className="space-y-6">
            <Link
              href="/student/recordings"
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-primary"
            >
              <span aria-hidden>&larr;</span>
              {t.t('rec.back_to_list')}
            </Link>

            <Card className="overflow-hidden">
              {embed !== '' ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={embed}
                    title={recording.title}
                    allow="autoplay"
                    allowFullScreen
                    className="h-full w-full border-0"
                  />
                </div>
              ) : (
                <Alert tone="warning" className="m-5" icon="bi-camera-video-off">
                  {t.t('rec.no_video')}
                </Alert>
              )}

              <CardBody>
                <h2 className="font-head text-xl font-semibold text-ink-heading">
                  {recording.title}
                </h2>

                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                  {recording.subject && <span>{recording.subject}</span>}
                  {recording.class_date && <span>{t.date(recording.class_date, 'd M Y')}</span>}
                  <span>{recording.teacher_name ?? t.t('rec.no_teacher')}</span>
                </p>

                {(recording.course || recording.batch) && (
                  <div className="mt-3">
                    <Badge tone="neutral">
                      {[recording.course, recording.batch].filter(Boolean).join(' · ')}
                    </Badge>
                  </div>
                )}
              </CardBody>
            </Card>

            {recording.description && (
              <Card>
                <CardHeader title={t.t('rec.about')} icon="bi-info-circle" />
                <CardBody>
                  <p className="whitespace-pre-line text-ink">{recording.description}</p>
                </CardBody>
              </Card>
            )}

            <Alert tone="info" icon="bi-wifi">
              {t.t('rec.iframe_failed')}
            </Alert>
          </div>
        );
      }}
    </StudentPage>
  );
}
