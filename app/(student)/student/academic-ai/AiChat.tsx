'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { askAction } from './actions';
import { emptyAskState } from './state';
import { AnswerText } from './AnswerText';

export interface ChatMessage {
  id: number;
  role: 'user' | 'model' | 'blocked';
  content: string;
  imageUrl: string;
  at: string;
}

/**
 * The chat.
 *
 * Two details worth naming:
 *
 *   - **A chosen photo is resized in the browser** before it is uploaded, to
 *     1400 px on the long edge. The original added this after photos from modern
 *     phones (8–12 MB) exhausted the server's memory limit while being
 *     base64-encoded. Doing it here means the upload is small too, which matters
 *     on a phone connection.
 *   - `imageOrientation: 'from-image'` applies the EXIF rotation. Without it a
 *     photo taken in portrait arrives sideways and the model reads a rotated page.
 */
export function AiChat({
  conversationId,
  messages,
  remainingToday,
  examples,
  imagesAllowed,
  labels,
}: {
  conversationId: number;
  messages: ChatMessage[];
  remainingToday: number;
  examples: string[];
  imagesAllowed: boolean;
  labels: {
    placeholder: string;
    send: string;
    thinking: string;
    you: string;
    assistant: string;
    attach: string;
    photoAlt: string;
    enterHint: string;
    remaining: string;
    welcomeTitle: string;
    welcomeBody: string;
    try: string;
    disclaimer: string;
    newChat: string;
    imageTooBig: string;
    imageType: string;
  };
}) {
  const [state, formAction, pending] = useActionState(askAction, emptyAskState);
  const [question, setQuestion] = useState('');
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoError, setPhotoError] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  // Clear the composer once a question has gone through.
  useEffect(() => {
    if (!pending && state.error === '') {
      setQuestion('');
      setPhoto(null);
    }
  }, [pending, state.error, messages.length]);

  async function choosePhoto(file: File | null) {
    setPhotoError('');
    if (!file) {
      setPhoto(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError(labels.imageType);
      return;
    }

    try {
      const resized = await resizeImage(file, 1400);
      setPhoto({ file: resized, preview: URL.createObjectURL(resized) });
    } catch {
      // Resizing failed (an odd codec, a very old browser): send the original
      // and let the server's size check decide.
      if (file.size > 4 * 1024 * 1024) {
        setPhotoError(labels.imageTooBig);
        return;
      }
      setPhoto({ file, preview: URL.createObjectURL(file) });
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pe-1">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-lg py-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-2xl text-primary">
              <i className="bi bi-stars" aria-hidden />
            </span>
            <h2 className="mt-4 font-head text-lg font-semibold text-ink-heading">
              {labels.welcomeTitle}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{labels.welcomeBody}</p>

            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {labels.try}
            </p>
            <ul className="mt-2 space-y-2">
              {examples.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setQuestion(example)}
                    className="w-full rounded-orbit border border-line bg-surface px-3 py-2 text-start text-sm text-ink transition hover:bg-surface-2"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-4 py-2">
            {messages.map((message) => {
              const mine = message.role === 'user' || message.role === 'blocked';
              return (
                <li
                  key={message.id}
                  className={cn('flex gap-3', mine ? 'justify-end' : 'justify-start')}
                >
                  {!mine && (
                    <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <i className="bi bi-stars" aria-hidden />
                    </span>
                  )}

                  <div
                    className={cn(
                      'max-w-[85%] rounded-orbit px-4 py-3 text-sm',
                      mine
                        ? 'bg-primary text-white'
                        : 'border border-line-soft bg-surface text-ink'
                    )}
                  >
                    <p
                      className={cn(
                        'mb-1 text-[11px] font-semibold uppercase tracking-wide',
                        mine ? 'text-white/70' : 'text-ink-muted'
                      )}
                    >
                      {mine ? labels.you : labels.assistant}
                    </p>

                    {message.imageUrl !== '' && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={message.imageUrl}
                        alt={labels.photoAlt}
                        className="mb-2 max-h-64 rounded object-contain"
                      />
                    )}

                    {mine ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <AnswerText content={message.content} />
                    )}
                  </div>
                </li>
              );
            })}

            {pending && (
              <li className="flex gap-3">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                  <i className="bi bi-stars" aria-hidden />
                </span>
                <div className="rounded-orbit border border-line-soft bg-surface px-4 py-3 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-primary"
                    />
                    {labels.thinking}
                  </span>
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <div className="mt-3 shrink-0 border-t border-line pt-3">
        {state.error !== '' && (
          <Alert tone="danger" className="mb-3">
            {state.error}
          </Alert>
        )}
        {photoError !== '' && (
          <Alert tone="danger" className="mb-3">
            {photoError}
          </Alert>
        )}

        <form
          ref={formRef}
          action={formAction}
          className="space-y-2"
          encType="multipart/form-data"
        >
          <input type="hidden" name="conversation" value={conversationId} />

          {photo && (
            <div className="flex items-center gap-3 rounded-orbit border border-line bg-surface-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt={labels.photoAlt} className="h-14 w-14 rounded object-cover" />
              <span className="flex-1 truncate text-xs text-ink-muted">{photo.file.name}</span>
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="text-ink-muted transition hover:text-red-600"
                aria-label={labels.attach}
              >
                <i className="bi bi-x-lg" aria-hidden />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {imagesAllowed && (
              <label
                className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-orbit border border-line text-ink-muted transition hover:text-primary"
                title={labels.attach}
              >
                <i className="bi bi-image" aria-hidden />
                <span className="sr-only">{labels.attach}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => void choosePhoto(event.currentTarget.files?.[0] ?? null)}
                />
              </label>
            )}

            <textarea
              name="question"
              value={question}
              onChange={(event) => setQuestion(event.currentTarget.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter makes a new line.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              rows={2}
              placeholder={labels.placeholder}
              className="min-h-10 flex-1 resize-none rounded-orbit border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            />

            <Button
              type="submit"
              disabled={pending || (question.trim() === '' && !photo)}
              icon="bi-send"
              className="h-10 shrink-0"
            >
              <span className="sr-only sm:not-sr-only">{labels.send}</span>
            </Button>
          </div>

          {/* The resized file is submitted, not the original the user picked. */}
          {photo && <PhotoField file={photo.file} />}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>{labels.enterHint}</span>
            {remainingToday > 0 && (
              <span>{labels.remaining.replace('{n}', String(remainingToday))}</span>
            )}
          </div>
        </form>

        <p className="mt-2 text-[11px] text-ink-muted">{labels.disclaimer}</p>
      </div>
    </div>
  );
}

/**
 * Puts the resized File into the form's `image` field.
 *
 * A `<input type="file">` cannot have its value set from script, so the resized
 * blob is written into a DataTransfer and assigned through `files`.
 */
function PhotoField({ file }: { file: File }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!input.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.current.files = transfer.files;
  }, [file]);

  return <input ref={input} type="file" name="image" className="sr-only" tabIndex={-1} aria-hidden />;
}

/**
 * Resizes an image to `maxEdge` on its long side.
 *
 * `imageOrientation: 'from-image'` applies the EXIF rotation, without which a
 * portrait photo from a phone arrives sideways and the model reads a rotated page.
 */
async function resizeImage(file: File, maxEdge: number): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  );
  if (!blob) throw new Error('encode failed');

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
