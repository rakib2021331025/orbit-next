import { safeUrl } from '@/lib/site/url';

/**
 * The 11-character YouTube id from a bare id or a YouTube link, else ''.
 *
 * Stricter than the loose reader the public pages use, and deliberately so: this
 * is the **write** side. The link must pass `safeUrl()` and point at a YouTube
 * host before an id is taken from it, so a pasted link from anywhere else can
 * never end up as an iframe source on the homepage.
 */
export function trialVideoId(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  if (text === '' || safeUrl(text) === '') return '';

  if (
    !/^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)(?:\/|$)/i.test(
      text
    )
  ) {
    return '';
  }

  const match = text.match(
    /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/|\/v\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
  );
  return match ? match[1] : '';
}

/** A watch link for a stored id; anything older is shown as it is. */
export function trialVideoLink(stored: string | null | undefined): string {
  const text = (stored ?? '').trim();
  return /^[A-Za-z0-9_-]{11}$/.test(text) ? `https://www.youtube.com/watch?v=${text}` : text;
}

/** YouTube's own still for a video — the fallback when no thumbnail was uploaded. */
export function trialThumbFallback(videoId: string): string {
  return videoId !== '' ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}
