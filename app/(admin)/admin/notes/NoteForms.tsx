'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/Feedback';
import { deleteNoteAction, saveNoteAction, sendNoteAction } from './actions';

const CONTROL =
  'w-full rounded-orbit border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const SMALL =
  'rounded-orbit border border-line px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-surface-2';

const EMPTY = { errors: [] as string[], message: '' };

export interface GroupItem {
  value: string;
  label: string;
  recipients: number;
}

export interface GroupGroup {
  label: string;
  items: GroupItem[];
}

/** One <select> holding every course and batch name a note may be tagged with. */
function GroupSelect({
  id,
  value,
  onChange,
  groups,
  other,
  labels,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  groups: GroupGroup[];
  other: GroupItem[];
  labels: Record<string, string>;
}) {
  return (
    <select
      id={id}
      name="batch"
      required
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={`mt-1 ${CONTROL}`}
    >
      <option value="">{labels.select}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </optgroup>
      ))}
      {other.length > 0 && (
        <optgroup label={labels.other}>
          {other.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** How many students a chosen name reaches — the number that decides the send. */
function reachOf(groups: GroupGroup[], other: GroupItem[], value: string): number | null {
  if (value === '') return null;
  for (const group of groups) {
    const found = group.items.find((item) => item.value === value);
    if (found) return found.recipients;
  }
  return other.find((item) => item.value === value)?.recipients ?? null;
}

export interface NoteValues {
  id: number;
  title: string;
  message: string;
  batch: string;
  pdfPath: string;
  pdfHref: string;
}

/** Uploading or editing one note. */
export function NoteForm({
  values,
  groups,
  other,
  cancelHref,
  labels,
}: {
  values: NoteValues;
  groups: GroupGroup[];
  other: GroupItem[];
  cancelHref: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveNoteAction, EMPTY);
  const [group, setGroup] = useState(values.batch);
  const editing = values.id > 0;
  const reach = reachOf(groups, other, group);

  return (
    <form action={action} className="space-y-4" id="noteForm">
      <input type="hidden" name="id" value={values.id} />

      {state.errors.length > 0 && (
        <Alert tone="danger">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <label className="block text-xs font-medium text-ink">
        {labels.title} *
        <input
          name="title"
          required
          maxLength={255}
          placeholder={labels.titlePlaceholder}
          defaultValue={values.title}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.group} *
        <GroupSelect
          id="noteGroup"
          value={group}
          onChange={setGroup}
          groups={groups}
          other={other}
          labels={{ select: labels.select, other: labels.other }}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">
          {reach === null
            ? labels.groupHint
            : labels.recipients.replace('{count}', String(reach))}
        </span>
      </label>

      <label className="block text-xs font-medium text-ink">
        {labels.message}
        <textarea
          name="message"
          rows={3}
          maxLength={5000}
          placeholder={labels.messagePlaceholder}
          defaultValue={values.message}
          className={`mt-1 ${CONTROL}`}
        />
      </label>

      <label className="block text-xs font-medium text-ink">
        {editing && values.pdfPath !== '' ? labels.replacePdf : `${labels.pdf} *`}
        <input
          type="file"
          name="pdf_file"
          accept="application/pdf,.pdf"
          required={!editing || values.pdfPath === ''}
          className={`mt-1 ${CONTROL}`}
        />
        <span className="mt-1 block text-[11px] font-normal text-ink-muted">{labels.pdfHint}</span>
      </label>

      {values.pdfHref !== '' && (
        <p className="text-xs">
          <a
            href={values.pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            <i className="bi bi-file-earmark-pdf me-1" aria-hidden /> {labels.openPdf}
          </a>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? labels.saving : editing ? labels.save : labels.upload}
        </button>
        {editing && (
          <Link
            href={cancelHref}
            className="rounded-orbit border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2"
          >
            {labels.cancel}
          </Link>
        )}
      </div>
    </form>
  );
}

/**
 * Emailing a note to a course or batch.
 *
 * Students who already received it are skipped by the server, so this is safe to
 * press again after adding students — and the label says so.
 */
export function SendNoteForm({
  notes,
  initialNote,
  initialGroup,
  groups,
  other,
  mailOn,
  labels,
}: {
  notes: { id: number; label: string; batch: string }[];
  initialNote: number;
  initialGroup: string;
  groups: GroupGroup[];
  other: GroupItem[];
  mailOn: boolean;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(sendNoteAction, EMPTY);
  const [noteId, setNoteId] = useState(String(initialNote || ''));
  const [group, setGroup] = useState(initialGroup);
  const [asking, setAsking] = useState(false);

  const reach = reachOf(groups, other, group);

  return (
    <form action={action} className="space-y-4" id="sendNote">
      {state.errors.length > 0 && (
        <Alert tone="warning">
          <ul className="list-inside list-disc space-y-1">
            {state.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {state.message !== '' && <Alert tone="success">{state.message}</Alert>}

      <p className="text-xs text-ink-muted">{labels.sub}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-medium text-ink">
          {labels.note} *
          <select
            name="note_id"
            required
            value={noteId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setNoteId(value);
              // The note's own tag is the obvious audience; it stays editable.
              const note = notes.find((row) => String(row.id) === value);
              if (note) setGroup(note.batch);
            }}
            className={`mt-1 ${CONTROL}`}
          >
            <option value="">{labels.select}</option>
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-ink">
          {labels.sendTo} *
          <GroupSelect
            id="sendGroup"
            value={group}
            onChange={setGroup}
            groups={groups}
            other={other}
            labels={{ select: labels.select, other: labels.other }}
          />
          <span className="mt-1 block text-[11px] font-normal text-ink-muted">
            {reach === null
              ? labels.pickGroup
              : labels.recipients.replace('{count}', String(reach))}
          </span>
        </label>
      </div>

      {!mailOn && <Alert tone="warning">{labels.mailOff}</Alert>}

      {asking ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">{labels.confirm}</span>
          <button
            type="submit"
            disabled={pending || !mailOn}
            className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? labels.sending : labels.send}
          </button>
          <button type="button" onClick={() => setAsking(false)} className={SMALL}>
            {labels.cancel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={!mailOn || noteId === '' || group === ''}
          className="rounded-orbit bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          <i className="bi bi-envelope-paper me-1" aria-hidden /> {labels.send}
        </button>
      )}
    </form>
  );
}

/** Deleting a note — its PDF and its sending history go with it. */
export function DeleteNote({
  noteId,
  title,
  labels,
}: {
  noteId: number;
  title: string;
  labels: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(deleteNoteAction, EMPTY);
  const [asking, setAsking] = useState(false);

  if (state.errors.length > 0) {
    return <span className="text-xs text-red-600">{state.errors[0]}</span>;
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        title={labels.remove}
        aria-label={`${labels.remove}: ${title}`}
        className={`${SMALL} text-red-600`}
      >
        <i className="bi bi-trash" aria-hidden />
      </button>
    );
  }

  return (
    <form action={action} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={noteId} />
      <span className="text-xs text-ink-muted">{labels.confirm.replace('{title}', title)}</span>
      <button
        type="submit"
        disabled={pending}
        className={`${SMALL} border-red-300 text-red-600 disabled:opacity-60`}
      >
        {labels.remove}
      </button>
      <button type="button" onClick={() => setAsking(false)} className={SMALL}>
        {labels.cancel}
      </button>
    </form>
  );
}
