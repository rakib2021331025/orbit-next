import { Card, CardBody } from '@/components/ui/Card';

/**
 * What a refused page shows.
 *
 * It states the reason and offers nothing else: no partial data, no filtered
 * version, no "request access". The original's orbit_branch_forbidden() does the
 * same — once a branch admin has reached a page that is not theirs, the only
 * correct amount of information to show is none.
 */
export function ForbiddenNotice({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardBody className="py-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <i className="bi bi-shield-lock" aria-hidden />
        </span>
        <h2 className="mt-4 font-head text-lg font-semibold text-ink-heading">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{body}</p>
      </CardBody>
    </Card>
  );
}
