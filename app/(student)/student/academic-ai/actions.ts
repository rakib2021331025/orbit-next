'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireStudentUnlocked } from '@/lib/auth/guards';
import { getTranslator } from '@/lib/i18n';
import { classify, refusal, type AiLanguage } from '@/lib/ai/filter';
import { askGemini, geminiAvailable, type GeminiTurn } from '@/lib/ai/gemini';
import { aiConfig, rateLimit, cacheKey, cacheGet, cachePut } from '@/lib/ai/quota';
import { validateUpload, uniqueFilename } from '@/lib/storage/validate';
import { putFile } from '@/lib/storage/store';
import { emptyAskState } from './state';

/**
 * Asking Orbit Academic AI a question.
 *
 * The order of operations is the security design, not an accident:
 *
 *   1. **Guard** — a signed-in student, or nothing.
 *   2. **Rate limit**, counted from the database.
 *   3. **The question is STORED BEFORE the API is called.** The original learned
 *      this the hard way: storing it afterwards meant a failed Gemini call left
 *      no record, so the limit was never spent and the endpoint could be hammered
 *      for free.
 *   4. **Layer 1** — the keyword filter refuses the obviously off-topic without
 *      spending a request.
 *   5. **Cache** — a question thirty students ask is bought once.
 *   6. **Layer 2** — the system instruction, which is the real boundary.
 *
 * The conversation is always re-read by (id, student_id), so a forged
 * conversation id lands the student in a new conversation of their own rather
 * than in somebody else's.
 */

export interface AskState {
  error: string;
  /** Set when the limit is what stopped them, so the page can say which. */
  limited: '' | 'minute' | 'day';
  remainingToday: number;
}


export async function askAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const student = await requireStudentUnlocked();
  const { t } = await getTranslator();

  const config = await aiConfig();
  if (!config.enabled || !geminiAvailable()) {
    return { ...emptyAskState, error: t('ai.err.unavailable') };
  }

  const question = String(formData.get('question') ?? '').trim();
  const rawConversation = String(formData.get('conversation') ?? '');
  const requestedConversation = /^\d{1,10}$/.test(rawConversation) ? Number(rawConversation) : 0;

  const imageFile = formData.get('image');
  const hasImage = imageFile instanceof File && imageFile.size > 0;

  if (question === '' && !hasImage) {
    return { ...emptyAskState, error: t('ai.err.empty') };
  }
  if (question.length > config.maxChars) {
    return { ...emptyAskState, error: t('ai.err.too_long', { max: config.maxChars }) };
  }
  if (hasImage && !config.images) {
    return { ...emptyAskState, error: t('ai.err.image_off') };
  }

  // 2. The limit.
  const verdict = await rateLimit(student.id, config);
  if (!verdict.allowed) {
    return {
      // One message for both scopes, as the original endpoint sends.
      error: t('ai.err.rate'),
      limited: verdict.scope === '' ? 'day' : verdict.scope,
      remainingToday: verdict.remainingToday,
    };
  }

  // The conversation, always keyed to this student.
  let conversationId = 0;
  try {
    if (requestedConversation > 0) {
      const existing = await prisma.aiConversation.findFirst({
        where: { id: requestedConversation, student_id: student.id },
        select: { id: true },
      });
      conversationId = existing?.id ?? 0;
    }
    if (conversationId === 0) {
      const created = await prisma.aiConversation.create({
        data: {
          student_id: student.id,
          title: question.slice(0, 120) || t('ai.photo_alt'),
        },
        select: { id: true },
      });
      conversationId = created.id;
    }
  } catch {
    return { ...emptyAskState, error: t('error.generic') };
  }

  // The photo, stored before the question so the row can point at it.
  let imagePath: string | null = null;
  let imageData: { bytes: Buffer; mime: string } | null = null;
  if (hasImage) {
    const check = await validateUpload(
      imageFile,
      ['jpg', 'jpeg', 'png', 'webp'],
      config.imageBytes
    );
    if (!check.ok || !check.bytes) {
      return { ...emptyAskState, error: check.error };
    }
    imagePath = await putFile(
      'uploads/ai',
      uniqueFilename(check.ext, `q${student.id}`),
      check.bytes,
      check.mime || undefined
    );
    if (!imagePath) {
      return { ...emptyAskState, error: t('ai.err.image_failed') };
    }
    // Keep the validated bytes and the SNIFFED type for the API call: the
    // browser's File.type is whatever the client says it is.
    imageData = { bytes: check.bytes, mime: check.mime || 'image/jpeg' };
  }

  const { verdict: topic, language } = classify(question);

  // 4. Layer 1: refuse the obviously off-topic without spending a request.
  if (topic === 'blocked') {
    await store(conversationId, student.id, 'blocked', question, imagePath, false);
    await store(conversationId, student.id, 'model', refusal(language), null, true);
    revalidatePath('/student/academic-ai');
    return { ...emptyAskState, remainingToday: verdict.remainingToday };
  }

  // 3. The question is recorded BEFORE the call, so a failure still spends the
  //    attempt and the endpoint cannot be hammered for free.
  await store(conversationId, student.id, 'user', question, imagePath, false);

  // 5. The shared cache — but never for a photo, whose answer is specific to it.
  const key = cacheKey(question, language);
  if (!hasImage) {
    const cached = await cacheGet(key, config);
    if (cached !== '') {
      await store(conversationId, student.id, 'model', cached, null, true);
      // Mark the question as cache-served so it does not spend the day's budget.
      await markCached(conversationId);
      revalidatePath('/student/academic-ai');
      return { ...emptyAskState, remainingToday: verdict.remainingToday };
    }
  }

  // The recent turns of this conversation, capped in both count and characters.
  const history = await recentTurns(conversationId, config.historyTurns, config.historyChars);

  const parts: GeminiTurn['parts'] = [];
  if (question !== '') {
    // The question is wrapped, and the instruction tells the model to treat
    // anything inside the block as a question rather than as instructions.
    parts.push({ text: `STUDENT QUESTION:\n${question}` });
  }
  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mime,
        data: imageData.bytes.toString('base64'),
      },
    });
  }

  const result = await askGemini([...history, { role: 'user', parts }]);

  if (!result.ok) {
    await store(conversationId, student.id, 'model', t('ai.err.network'), null, false);
    revalidatePath('/student/academic-ai');
    return { ...emptyAskState, error: t('ai.err.network') };
  }

  await store(conversationId, student.id, 'model', result.text, null, false);
  if (!hasImage) await cachePut(key, question, result.text, language);

  revalidatePath('/student/academic-ai');
  return { ...emptyAskState, remainingToday: Math.max(0, verdict.remainingToday - 1) };
}

/** Starts a fresh conversation. */
export async function newConversationAction(): Promise<void> {
  await requireStudentUnlocked();
  revalidatePath('/student/academic-ai');
}

/* ------------------------------------------------------------------ helpers */

async function store(
  conversationId: number,
  studentId: number,
  role: 'user' | 'model' | 'blocked',
  content: string,
  imagePath: string | null,
  fromCache: boolean
): Promise<void> {
  try {
    await prisma.aiMessage.create({
      data: {
        conversation_id: conversationId,
        student_id: studentId,
        role,
        content,
        image_path: imagePath,
        from_cache: fromCache,
      },
    });
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });
  } catch {
    // Requires database configuration.
  }
}

/** Marks the newest question in a conversation as cache-served. */
async function markCached(conversationId: number): Promise<void> {
  try {
    const newest = await prisma.aiMessage.findFirst({
      where: { conversation_id: conversationId, role: 'user' },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    if (newest) {
      await prisma.aiMessage.update({ where: { id: newest.id }, data: { from_cache: true } });
    }
  } catch {
    // Not fatal; at worst the question counts against the day's budget.
  }
}

/**
 * The recent turns, capped by count AND by characters.
 *
 * The character cap is the one that matters: eight turns of a long derivation
 * would be a very expensive request, so the oldest are dropped until the context
 * fits.
 */
async function recentTurns(
  conversationId: number,
  maxTurns: number,
  maxChars: number
): Promise<GeminiTurn[]> {
  if (maxTurns <= 0) return [];

  try {
    const rows = await prisma.aiMessage.findMany({
      where: { conversation_id: conversationId, role: { in: ['user', 'model'] } },
      orderBy: { id: 'desc' },
      take: maxTurns * 2,
      select: { role: true, content: true },
    });

    const turns: GeminiTurn[] = [];
    let chars = 0;

    // Newest first while budgeting, then reversed so the model reads them in
    // order.
    for (const row of rows) {
      chars += row.content.length;
      if (chars > maxChars) break;
      turns.push({
        role: row.role === 'user' ? 'user' : 'model',
        parts: [{ text: row.content }],
      });
    }

    return turns.reverse();
  } catch {
    return [];
  }
}
