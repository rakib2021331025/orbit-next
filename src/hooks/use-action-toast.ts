"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { ActionState } from "@/lib/action-result";

/**
 * Surfaces a Server Action's result as a toast, exactly once per state change,
 * and optionally runs a callback on success (to close a dialog, reset a form…).
 *
 * `useActionState` returns a new object on every submission, so the state
 * identity itself is the change signal.
 */
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const seen = useRef<ActionState | null>(null);
  const callback = useRef(onSuccess);
  callback.current = onSuccess;

  useEffect(() => {
    if (state === seen.current || state.status === "idle") return;
    seen.current = state;

    if (state.status === "success") {
      toast.success(state.message ?? "Saved.");
      callback.current?.();
    } else if (state.status === "error") {
      toast.error(state.message ?? "Something went wrong.");
    }
  }, [state]);
}
