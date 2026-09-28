import { redirect } from 'next/navigation';

/**
 * `/admission` → `/apply`, from admission.php.
 *
 * The original replaced a second, flatter admission form with the sectioned one
 * and kept this URL as a redirect rather than a copy: "two admission forms
 * writing to the same table is exactly the duplicate system worth avoiding". The
 * URL survives because it is printed on leaflets and linked from the navbar.
 *
 * A preselected course or batch is carried straight through, so
 * `/admission?course=3` lands in the right place.
 */
export default async function AdmissionRedirect({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; batch?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  // Only digits are forwarded: this is a redirect target, and anything else in
  // the query string has no business being reflected.
  if (/^\d+$/.test(params.course ?? '')) query.set('course', params.course!);
  if (/^\d+$/.test(params.batch ?? '')) query.set('batch', params.batch!);

  const target = query.toString() === '' ? '/apply' : `/apply?${query.toString()}`;
  // A temporary redirect, as the original notes: a permanent one is cached hard
  // by browsers and painful to undo if the two pages are ever separated again.
  redirect(target);
}
