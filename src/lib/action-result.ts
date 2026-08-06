import { ZodError } from "zod";

// Imported from `errors.ts`, not from `guards.ts`/`storage.ts`: this module is
// also imported by client components, so it must stay free of any server-only
// transitive dependency.
import { AuthorizationError, UploadError } from "@/lib/errors";
import { fieldErrors } from "@/lib/validation";

/**
 * The shape every Server Action returns, so `useActionState` forms can render
 * errors uniformly.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const IDLE: ActionState = { status: "idle" };

export const ok = (message?: string): ActionState => ({ status: "success", message });

export const fail = (message: string, fields?: Record<string, string>): ActionState => ({
  status: "error",
  message,
  fieldErrors: fields,
});

/**
 * Converts a thrown error into an ActionState.
 *
 * Only errors we raised deliberately (validation, authorisation, upload) have
 * their message shown. Anything else is logged server-side and reported
 * generically — the legacy PHP app printed raw PDO exceptions to the browser,
 * which leaked schema details.
 */
export function toActionState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    return fail("Please correct the highlighted fields.", fieldErrors(error));
  }
  if (error instanceof AuthorizationError || error instanceof UploadError) {
    return fail(error.message);
  }

  // Prisma unique-constraint violation.
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  ) {
    return fail("That value is already in use.");
  }

  console.error("[action] unexpected error", error);
  return fail("Something went wrong. Please try again.");
}
