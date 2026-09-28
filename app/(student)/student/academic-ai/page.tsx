import type { Metadata } from 'next';
import { StudentPage } from '@/components/portal/StudentPage';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { getLang, translate } from '@/lib/i18n';
import { prisma } from '@/lib/db/prisma';
import { aiConfig, rateLimit } from '@/lib/ai/quota';
import { geminiAvailable } from '@/lib/ai/gemini';
import { aiImageUrl } from '@/lib/storage/url';
import { AiChat, type ChatMessage } from './AiChat';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'ai.title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Orbit Academic AI, from student/academic_ai.php.
 *
 * The page renders nothing but an explanation when the feature is off or has no
 * API key — the menu entry is hidden in that case too, so a student should never
 * arrive here, and if they do by URL they are told plainly rather than shown a
 * composer that cannot answer.
 */
export default async function AcademicAiPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const params = await searchParams;

  return (
    <StudentPage
      active="academic_ai"
      title={(t) => t.t('ai.title')}
      subtitle={(t) => t.t('ai.subtitle')}
    >
      {async ({ student, t }) => {
        const config = await aiConfig();

        if (!config.enabled || !geminiAvailable()) {
          return (
            <Card>
              <EmptyState
                icon="bi-stars"
                title={t.t('ai.off_title')}
                body={t.t('ai.off_body')}
              />
            </Card>
          );
        }

        // The conversation to continue: the requested one if it is this
        // student's, otherwise their most recent, otherwise a fresh one.
        let conversationId = 0;
        const requested = /^\d+$/.test(params.c ?? '') ? Number(params.c) : 0;
        try {
          const conversation = requested > 0
            ? await prisma.aiConversation.findFirst({
                where: { id: requested, student_id: student.id },
                select: { id: true },
              })
            : await prisma.aiConversation.findFirst({
                where: { student_id: student.id },
                orderBy: { updated_at: 'desc' },
                select: { id: true },
              });
          conversationId = conversation?.id ?? 0;
        } catch {
          conversationId = 0;
        }

        let messages: ChatMessage[] = [];
        if (conversationId > 0) {
          try {
            const rows = await prisma.aiMessage.findMany({
              where: { conversation_id: conversationId, student_id: student.id },
              orderBy: { id: 'asc' },
              take: 100,
              select: { id: true, role: true, content: true, image_path: true, created_at: true },
            });
            messages = rows.map((row) => ({
              id: row.id,
              role: row.role,
              content: row.content,
              imageUrl: aiImageUrl(row),
              at: t.date(row.created_at, 'd M Y, h:i A'),
            }));
          } catch {
            messages = [];
          }
        }

        const verdict = await rateLimit(student.id, config);

        return (
          <AiChat
            conversationId={conversationId}
            messages={messages}
            remainingToday={verdict.remainingToday}
            imagesAllowed={config.images}
            examples={[1, 2, 3, 4, 5].map((n) => t.t(`ai.example${n}`))}
            labels={{
              placeholder: t.t('ai.placeholder'),
              send: t.t('ai.send'),
              thinking: t.t('ai.thinking'),
              you: t.t('ai.you'),
              assistant: t.t('ai.assistant'),
              attach: t.t('ai.attach'),
              photoAlt: t.t('ai.photo_alt'),
              enterHint: t.t('ai.enter_hint'),
              remaining: t.t('ai.remaining'),
              welcomeTitle: t.t('ai.welcome_title'),
              welcomeBody: t.t('ai.welcome_body'),
              try: t.t('ai.try'),
              disclaimer: t.t('ai.disclaimer'),
              newChat: t.t('ai.new_chat'),
              imageTooBig: t.t('ai.err.image_big'),
              imageType: t.t('ai.err.image_type'),
            }}
          />
        );
      }}
    </StudentPage>
  );
}
