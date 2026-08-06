import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { LoginForm } from "./login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Orbit Private Care portal.",
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      {/* Soft brand wash — subtle in light, near-invisible in dark. */}
      <div
        aria-hidden
        className="from-primary/10 pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br via-transparent to-transparent"
      />

      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            className="bg-primary text-primary-foreground mb-4 flex size-12 items-center justify-center rounded-xl"
          >
            <GraduationCap className="size-6" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sign in to your Orbit Private Care account
          </p>
        </div>

        <LoginForm />

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Not enrolled yet?{" "}
          <Link href="/admission" className="text-foreground font-medium underline-offset-4 hover:underline">
            Apply for admission
          </Link>
        </p>
      </div>
    </main>
  );
}
