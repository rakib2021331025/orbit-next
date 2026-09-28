import 'server-only';
import { randomBytes } from 'node:crypto';
import { getTranslator } from '@/lib/i18n';

/**
 * Upload validation, from orbit_validate_upload().
 *
 * Three checks, and the second and third are the ones that matter:
 *
 *   1. Size and extension — the obvious pair, and on their own worthless: an
 *      attacker names their script `photo.jpg`.
 *   2. **The real content type**, sniffed from the file's own bytes. An
 *      extension is a claim by the uploader; the magic number is evidence.
 *   3. **Images must decode.** A file can carry a valid PNG header and still be
 *      a payload; requiring real dimensions rejects it.
 *
 * Only the extensions listed here are ever accepted, so a new file type has to
 * be added deliberately.
 */

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const DOCUMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'zip',
] as const;

export type UploadCode = 'none' | 'too_big' | 'type' | 'mismatch' | 'corrupt' | 'empty' | 'invalid' | 'failed';

export interface UploadCheck {
  ok: boolean;
  error: string;
  code: UploadCode | '';
  ext: string;
  mime: string;
  bytes: Buffer | null;
}

/** Magic numbers, checked against the claimed extension. */
const SIGNATURES: { ext: string[]; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: ['jpg', 'jpeg'], mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: ['png'],
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: ['webp'],
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { ext: ['pdf'], mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  {
    // The OOXML formats and .zip share one container format.
    ext: ['docx', 'pptx', 'xlsx', 'zip'],
    mime: 'application/zip',
    test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
  },
  {
    ext: ['doc', 'ppt', 'xls'],
    mime: 'application/vnd.ms-office',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
  },
];

export async function validateUpload(
  file: File | null,
  allowedExtensions: readonly string[],
  maxBytes = 10 * 1024 * 1024
): Promise<UploadCheck> {
  const { t, number } = await getTranslator();

  const fail = (code: UploadCode, key: string, vars?: Record<string, string | number>): UploadCheck => ({
    ok: false,
    error: t(key, vars),
    code,
    ext: '',
    mime: '',
    bytes: null,
  });

  const megabytes = (bytes: number) => {
    const mb = Math.round((bytes / 1048576) * 10) / 10;
    return number(mb, Number.isInteger(mb) ? 0 : 1);
  };

  if (!file || file.size === 0) {
    // An empty file input arrives as a zero-byte File, not as null.
    return fail('none', 'upload.none');
  }
  if (file.size > maxBytes) {
    return fail('too_big', 'upload.too_big', { size: megabytes(maxBytes) });
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return fail('type', 'upload.bad_type', {
      types: allowedExtensions.join(', ').toUpperCase(),
    });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return fail('empty', 'upload.failed');

  // The extension is a claim; the signature is evidence.
  const signature = SIGNATURES.find((entry) => entry.ext.includes(ext));
  if (signature && !signature.test(bytes)) {
    return fail('mismatch', 'upload.mismatch');
  }

  // Plain text has no magic number, so it is the one allowed type that could
  // smuggle markup or a script. Refuse anything binary or HTML-looking: served
  // back from a bucket with a sniffing browser, that would be stored XSS.
  if (ext === 'txt' && !looksLikePlainText(bytes)) {
    return fail('mismatch', 'upload.mismatch');
  }

  // An image must actually decode — a valid header alone is not enough.
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    const size = imageSize(bytes, ext);
    if (!size || size.width <= 0 || size.height <= 0) {
      return fail('corrupt', 'upload.corrupt');
    }
  }

  return {
    ok: true,
    error: '',
    code: '',
    ext,
    mime: signature?.mime ?? (ext === 'txt' ? 'text/plain' : ''),
    bytes,
  };
}

/** No NUL bytes and no markup a browser would render. Checks the first 64 KB. */
function looksLikePlainText(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 65_536);
  if (head.includes(0)) return false;
  const text = head.toString('latin1').toLowerCase();
  return !/<\s*(!doctype|html|head|body|script|svg|iframe|object|embed|meta|\?php|\?xml)/.test(text);
}

/**
 * Dimensions from the file header, without decoding the whole image.
 *
 * Enough to prove the file is a real image: a disguised script has no valid
 * dimension fields at the right offsets.
 */
export function imageSize(buffer: Buffer, ext: string): { width: number; height: number } | null {
  try {
    if (ext === 'png') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }

    if (ext === 'webp') {
      const format = buffer.subarray(12, 16).toString('ascii');
      if (format === 'VP8 ') {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (format === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (format === 'VP8X') {
        return {
          width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
          height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
        };
      }
      return null;
    }

    if (ext === 'jpg' || ext === 'jpeg') {
      // Walk the segment chain to the frame header that carries the size.
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) return null;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        // SOF0–SOF15, excluding the four that are not frame headers.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
      return null;
    }
  } catch {
    // A truncated file throws on a read past the end — which is itself the answer.
    return null;
  }
  return null;
}

/**
 * A collision-proof, non-guessable file name.
 *
 * Random rather than sequential: a payment screenshot at a predictable path
 * could be found by walking the numbers, even with the directory listing off.
 */
export function uniqueFilename(ext: string, prefix = ''): string {
  const clean = prefix.replace(/[^a-z0-9_-]/gi, '');
  const stamp = Math.floor(Date.now() / 1000);
  return `${clean !== '' ? `${clean}_` : ''}${randomBytes(8).toString('hex')}_${stamp}.${ext.toLowerCase()}`;
}
