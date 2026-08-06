"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";

import { submitEvaluation } from "./actions";
import { IDLE } from "@/lib/action-result";
import { EVALUATION_CRITERIA } from "@/lib/validation";
import { useActionToast } from "@/hooks/use-action-toast";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function EvaluationDialog({
  teacherId,
  teacherName,
  batchId,
  batchLabel,
  hasSubmitted,
}: {
  teacherId: string;
  teacherName: string;
  batchId: string;
  batchLabel: string;
  hasSubmitted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(submitEvaluation, IDLE);
  const [formKey, setFormKey] = useState(0);

  useActionToast(state, () => {
    setOpen(false);
    setFormKey((k) => k + 1);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasSubmitted ? "outline" : "default"} className="w-full">
          <Star className="size-4" />
          {hasSubmitted ? "Update rating" : "Rate teacher"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rate {teacherName}</DialogTitle>
          <DialogDescription>{batchLabel}</DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-5">
          <input type="hidden" name="teacherId" value={teacherId} />
          <input type="hidden" name="batchId" value={batchId} />

          <div className="space-y-4">
            {EVALUATION_CRITERIA.map((criterion) => (
              <RatingRow
                key={criterion.key}
                name={criterion.key}
                label={criterion.label}
                error={state.fieldErrors?.[criterion.key]}
              />
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="eval-comment">Comments (optional)</Label>
            <Textarea
              id="eval-comment"
              name="comment"
              rows={3}
              placeholder="What went well? What could be improved?"
            />
          </div>

          <div className="bg-muted/50 flex items-start gap-3 rounded-lg p-3">
            <Switch id="eval-anonymous" name="isAnonymous" className="mt-0.5" />
            <div>
              <Label htmlFor="eval-anonymous" className="font-normal">
                Submit anonymously
              </Label>
              <p className="text-muted-foreground text-xs">
                Your name is hidden from the teacher. Administrators can still see
                it for moderation.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Submitting…">Submit rating</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Five radio inputs styled as stars — keyboard accessible, no JS state. */
function RatingRow({
  name,
  label,
  error,
}: {
  name: string;
  label: string;
  error?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label className="font-normal" htmlFor={`${name}-5`}>
        {label}
      </Label>

      <div className="flex flex-row-reverse items-center gap-1">
        {/* Reversed so the CSS sibling selector can light up lower stars. */}
        {[5, 4, 3, 2, 1].map((value) => (
          <div key={value} className="group">
            <input
              type="radio"
              id={`${name}-${value}`}
              name={name}
              value={value}
              className="peer sr-only"
              required
            />
            <label
              htmlFor={`${name}-${value}`}
              title={`${value} out of 5`}
              className={cn(
                "block cursor-pointer p-0.5",
                "text-muted-foreground/40 hover:text-amber-400",
                "peer-checked:text-amber-500 peer-focus-visible:ring-ring peer-focus-visible:ring-2 peer-focus-visible:rounded-sm",
                "group-has-[~_.group_input:checked]:text-amber-500",
              )}
            >
              <Star className="size-5 fill-current" />
              <span className="sr-only">
                {value} star{value === 1 ? "" : "s"} for {label}
              </span>
            </label>
          </div>
        ))}
      </div>

      {error && <p className="text-destructive w-full text-sm">{error}</p>}
    </div>
  );
}
