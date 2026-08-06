"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A submit button wired to the enclosing form's pending state. Must live inside
 * a <form> — useFormStatus reads from the nearest form context.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { children: ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}
