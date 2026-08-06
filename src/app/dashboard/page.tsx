import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/auth.config";

/**
 * Post-login dispatcher. Sign-in cannot know the user's role until the session
 * cookie is written, so it always lands here and this route forwards to the
 * correct dashboard.
 */
export default async function DashboardRedirectPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(ROLE_HOME[session.user.role]);
}
