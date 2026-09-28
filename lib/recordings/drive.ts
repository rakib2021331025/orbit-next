/**
 * Google Drive ids for recorded classes, from includes/recorded_class_lib.php.
 *
 * There is no Google API, no OAuth and no Cloud project. The Drive link an admin
 * pastes is the whole integration: the id out of it is stored, and comes back out
 * into an iframe `src`.
 *
 * Two rules keep that safe:
 *
 *   1. **A link is only mined for an id when its host really is Drive.** A
 *      YouTube URL or a half-copied line is rejected outright rather than
 *      searched for something id-shaped — otherwise it becomes a recording that
 *      plays nothing, and nobody finds out until a student tries.
 *   2. **The id is validated again when building the URL.** A row damaged by a
 *      direct database edit cannot put arbitrary text into an iframe `src`.
 *
 * Only the id is stored, never the link: the link carries sharing parameters and
 * identifies the account that copied it.
 */

/** True for something that can be a Drive file id. */
export function isValidDriveId(id: unknown): boolean {
  return /^[A-Za-z0-9_-]{10,128}$/.test(String(id ?? ''));
}

/** The file id out of whatever the admin pasted, or '' when there is none. */
export function driveFileId(input: unknown): string {
  const value = String(input ?? '').trim();
  if (value === '') return '';

  // The id on its own. Nothing else can look like this: the pattern allows no
  // colon, slash, dot or space.
  if (isValidDriveId(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return '';
  }

  if (!['http:', 'https:'].includes(url.protocol)) return '';
  if (!/(^|\.)(drive|docs)\.google\.com$/.test(url.hostname.toLowerCase())) return '';

  // /file/d/<id>/ and /d/<id>/ — the shape "Copy link" produces.
  const fromPath = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,128})/);
  if (fromPath) return fromPath[1];

  // ?id=<id>, as the open and download links use.
  const fromQuery = url.searchParams.get('id') ?? '';
  return isValidDriveId(fromQuery) ? fromQuery : '';
}

/**
 * The player URL.
 *
 * `/preview` is Drive's embeddable player. `/view` is the Drive page and refuses
 * to be framed, so using it would give every student a blank box.
 */
export function driveEmbedUrl(driveId: unknown): string {
  const id = String(driveId ?? '');
  if (!isValidDriveId(id)) return '';
  return `https://drive.google.com/file/d/${id}/preview`;
}
