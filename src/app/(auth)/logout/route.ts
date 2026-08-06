import { signOut } from "@/lib/auth";

/**
 * POST-only sign-out. A GET would let any third-party page log the user out
 * with an <img> tag, so the form in the dashboard header posts here instead.
 */
export async function POST() {
  await signOut({ redirectTo: "/login" });
}
