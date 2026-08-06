"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Loader2 } from "lucide-react";

import { loginAction, type LoginState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4" noValidate>
          {state.error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="identifier">Email or username</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoFocus
              aria-invalid={Boolean(state.fieldErrors?.identifier)}
              aria-describedby={state.fieldErrors?.identifier ? "identifier-error" : undefined}
            />
            {state.fieldErrors?.identifier && (
              <p id="identifier-error" className="text-destructive text-sm">
                {state.fieldErrors.identifier}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Students sign in with their username; staff use their email address.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(state.fieldErrors?.password)}
              aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
            />
            {state.fieldErrors?.password && (
              <p id="password-error" className="text-destructive text-sm">
                {state.fieldErrors.password}
              </p>
            )}
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
