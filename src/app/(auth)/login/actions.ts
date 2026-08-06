"use server";

import { AuthError } from "next-auth";
import { unstable_rethrow } from "next/navigation";

import { signIn } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"identifier" | "password", string>>;
};

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fields: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "identifier" | "password";
      fields[key] ??= issue.message;
    }
    return { fieldErrors: fields };
  }

  try {
    // The role isn't known until the session cookie exists, so sign-in always
    // lands on /dashboard, which reads the session and forwards to the right
    // role home (/admin, /teacher or /student).
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
    return {};
  } catch (error) {
    // signIn throws a redirect on success — let Next's own control-flow
    // errors (redirect, notFound, …) propagate untouched.
    unstable_rethrow(error);

    if (error instanceof AuthError) {
      // Deliberately vague: never reveal whether the account exists.
      return { error: "Incorrect email/username or password." };
    }
    console.error("[login] unexpected error", error);
    return { error: "Something went wrong. Please try again." };
  }
}
