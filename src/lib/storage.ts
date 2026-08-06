import "server-only";

import { put, del } from "@vercel/blob";

import { UploadError } from "@/lib/errors";
import { UPLOAD_LIMITS, type UploadKind } from "@/lib/upload-limits";

/**
 * Vercel Blob file storage.
 *
 * The legacy PHP app wrote uploads into `uploads/` and `images/` inside the
 * project directory. That cannot work on Vercel — the filesystem is read-only
 * and ephemeral between invocations. Everything goes to Blob instead, and only
 * the returned URL is persisted in Postgres.
 */

export { UPLOAD_LIMITS, UploadError };
export type { UploadKind };

export type UploadResult = {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
};

/**
 * Validates a browser `File` against its kind, then stores it under
 * `folder/`. Filenames get a random suffix so two uploads of "notes.pdf"
 * cannot collide or overwrite each other.
 */
export async function uploadFile(
  file: File,
  folder: string,
  kind: UploadKind = "image",
): Promise<UploadResult> {
  const limits = UPLOAD_LIMITS[kind];

  if (file.size === 0) {
    throw new UploadError("The selected file is empty.");
  }
  if (file.size > limits.maxBytes) {
    throw new UploadError(
      `File is too large. Allowed: ${limits.label}.`,
    );
  }
  // Trust the sniffed type over the extension — an attacker controls the name.
  if (!(limits.mimeTypes as readonly string[]).includes(file.type)) {
    throw new UploadError(`Unsupported file type. Allowed: ${limits.label}.`);
  }

  const blob = await put(`${folder}/${sanitizeFilename(file.name)}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: file.type,
    size: file.size,
  };
}

/**
 * Deletes a blob. Never throws: a missing or already-deleted blob must not
 * block the database row from being removed.
 */
export async function deleteFile(urlOrPathname: string | null | undefined): Promise<void> {
  if (!urlOrPathname) return;
  try {
    await del(urlOrPathname);
  } catch (error) {
    console.error("[storage] failed to delete blob", urlOrPathname, error);
  }
}

/** Strips directory separators and control characters from a client filename. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return (
    base
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "file"
  );
}
