'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTeacher } from '@/lib/auth/guards';
import { getLang, translate, toLocalDigits } from '@/lib/i18n';
import { markAllRead, markOneRead, clearRead } from '@/lib/notifications/manage';
import { notificationLink } from '@/lib/notifications/link';

/**
 * The teacher's notification actions.
 *
 * Each one passes the signed-in teacher's id to the library, which puts it in
 * the WHERE clause — the id in the form only ever names a row, never the owner.
 */

export interface NotificationFormState {
  error: string;
  message: string;
}


async function present(outcome: {
  ok: boolean;
  message: string;
  vars?: Record<string, string | number>;
}): Promise<NotificationFormState> {
  const lang = await getLang();
  const vars: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(outcome.vars ?? {})) {
    vars[name] = typeof value === 'number' ? toLocalDigits(value, lang) : value;
  }
  const text = translate(lang, outcome.message, vars);
  return outcome.ok ? { error: '', message: text } : { error: text, message: '' };
}

export async function markAllReadAction(
  _prev: NotificationFormState,
  _formData: FormData
): Promise<NotificationFormState> {
  const teacher = await requireTeacher();
  const outcome = await markAllRead('teacher', teacher.id);
  revalidatePath('/teacher/notifications');
  return present(outcome);
}

export async function markOneReadAction(
  _prev: NotificationFormState,
  formData: FormData
): Promise<NotificationFormState> {
  const teacher = await requireTeacher();
  const outcome = await markOneRead('teacher', teacher.id, Number(formData.get('id') ?? 0));
  revalidatePath('/teacher/notifications');
  return present(outcome);
}

export async function clearReadAction(
  _prev: NotificationFormState,
  _formData: FormData
): Promise<NotificationFormState> {
  const teacher = await requireTeacher();
  const outcome = await clearRead('teacher', teacher.id);
  revalidatePath('/teacher/notifications');
  return present(outcome);
}

/**
 * Marks one read and goes where it points.
 *
 * Only an internal link is followed. An outside address is offered as a normal
 * link on the page instead, so a stored URL can never make the portal navigate
 * itself somewhere else.
 */
export async function openNotificationAction(
  _prev: NotificationFormState,
  formData: FormData
): Promise<NotificationFormState> {
  const teacher = await requireTeacher();
  const outcome = await markOneRead('teacher', teacher.id, Number(formData.get('id') ?? 0));

  if (!outcome.ok) return present(outcome);

  revalidatePath('/teacher/notifications');

  const target = notificationLink(outcome.link, 'teacher');
  if (target && !target.external) redirect(target.href);

  return present(outcome);
}
