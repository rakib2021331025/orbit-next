/**
 * Upload constraints, shared by the server (which enforces them) and by client
 * forms (which use them for `accept` attributes and help text).
 *
 * Kept separate from `storage.ts` so that importing the limits into a client
 * component does not also pull `@vercel/blob` into the browser bundle.
 */

export const UPLOAD_LIMITS = {
  image: {
    maxBytes: 10 * 1024 * 1024, // 10 MB, matching the legacy gallery limit
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    label: "JPG, PNG, WEBP or AVIF up to 10 MB",
  },
  document: {
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    label: "PDF, DOC, DOCX, PPT or PPTX up to 25 MB",
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_LIMITS;
