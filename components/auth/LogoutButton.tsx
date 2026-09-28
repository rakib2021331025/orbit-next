import { logoutAction } from '@/lib/auth/actions';

/**
 * Signing out is a POST, not a link.
 *
 * The PHP app used a GET logout.php, which means any image tag on any site could
 * sign a user out. Harmless, but it is a state change, and a server action gives
 * Origin checking for free — so the button posts.
 */
export function LogoutButton({ label, className }: { label: string; className?: string }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className={
          className ??
          'inline-flex w-full items-center gap-2 rounded-orbit px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-3 hover:text-ink'
        }
      >
        <span aria-hidden>&#8617;</span>
        {label}
      </button>
    </form>
  );
}

/**
 * The page behind /<portal>/logout, for anyone who navigates there directly or
 * follows an old bookmark. It asks rather than acting on a GET.
 *
 * `body` says "this device", which is literally what happens: only this
 * browser's remember-me token is dropped.
 */
export function LogoutConfirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  cancelHref,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  cancelHref: string;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-page px-5">
      <div className="w-full max-w-sm rounded-orbit border border-line bg-surface p-7 text-center shadow-orbit">
        <h1 className="font-head text-xl font-semibold text-ink-heading">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{body}</p>
        <form action={logoutAction} className="mt-6 space-y-2">
          <button
            type="submit"
            className="w-full rounded-orbit bg-primary px-4 py-2.5 font-medium text-white transition hover:bg-primary-hover"
          >
            {confirmLabel}
          </button>
        </form>
        <a
          href={cancelHref}
          className="mt-2 inline-block w-full rounded-orbit border border-line px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-2"
        >
          {cancelLabel}
        </a>
      </div>
    </main>
  );
}
