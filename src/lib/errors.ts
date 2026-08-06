/**
 * Plain error classes with no server-only dependencies.
 *
 * These live apart from `guards.ts` and `storage.ts` deliberately. Client
 * components import `action-result.ts` for the `ActionState` type and `IDLE`
 * constant; if that module reached these classes through `guards.ts`, the
 * import chain would pull `auth` → `prisma` → `pg` into the browser bundle and
 * the build would fail on Node built-ins like `net` and `tls`.
 */

export class AuthorizationError extends Error {
  constructor(message = "You are not allowed to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Thrown when an uploaded file fails validation — safe to show to the user. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}
