import 'server-only';
import { createHash, createHmac } from 'node:crypto';

/**
 * A minimal S3 client: PUT, GET and DELETE, signed with SigV4.
 *
 * The AWS SDK is roughly 10 MB in a function bundle and this app needs three
 * operations, so the signature is computed directly. It works against S3 itself
 * and against any S3-compatible service (R2, Backblaze B2, MinIO, Spaces) by
 * pointing `ORBIT_S3_ENDPOINT` at it.
 *
 * **Requires configuration**: `ORBIT_S3_BUCKET`, `ORBIT_S3_REGION`,
 * `ORBIT_S3_ENDPOINT`, `ORBIT_S3_ACCESS_KEY_ID`, `ORBIT_S3_SECRET_ACCESS_KEY`.
 * Every function returns a failure rather than throwing when they are missing,
 * so a misconfigured deployment degrades instead of crashing.
 *
 * Objects are private. Nothing here generates a public URL: uploads are read
 * back through the authorising media route, which is the whole point of keeping
 * student photos and payment screenshots out of a public bucket.
 */

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function config(): S3Config | null {
  const bucket = process.env.ORBIT_S3_BUCKET ?? '';
  const region = process.env.ORBIT_S3_REGION ?? '';
  const endpoint = (process.env.ORBIT_S3_ENDPOINT ?? '').replace(/\/+$/, '');
  const accessKeyId = process.env.ORBIT_S3_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.ORBIT_S3_SECRET_ACCESS_KEY ?? '';

  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return { bucket, region, endpoint, accessKeyId, secretAccessKey };
}

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * Signs and sends one request.
 *
 * Only the path is URI-encoded per segment; encoding the slashes would make the
 * canonical request disagree with the URL and every signature would fail.
 */
async function signedFetch(
  method: 'PUT' | 'GET' | 'DELETE',
  objectKey: string,
  body?: Buffer,
  contentType?: string
): Promise<Response | null> {
  const cfg = config();
  if (!cfg) return null;

  const key = objectKey.replace(/^\/+/, '');
  const canonicalUri = `/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const url = `${cfg.endpoint}${canonicalUri}`;
  const host = new URL(cfg.endpoint).host;

  const payloadHash = body ? createHash('sha256').update(body).digest('hex') : EMPTY_SHA256;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join('');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dateStamp), cfg.region), 's3'),
    'aws4_request'
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  try {
    return await fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: body as BodyInit | undefined,
      cache: 'no-store',
    });
  } catch {
    return null;
  }
}

export async function s3Request(
  method: 'PUT' | 'DELETE',
  objectKey: string,
  body?: Buffer,
  contentType?: string
): Promise<boolean> {
  const response = await signedFetch(method, objectKey, body, contentType);
  return response !== null && response.ok;
}

export async function s3Fetch(objectKey: string): Promise<Buffer | null> {
  const response = await signedFetch('GET', objectKey);
  if (!response || !response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}
