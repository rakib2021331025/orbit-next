"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";

import { uploadImages } from "./actions";
import { IDLE } from "@/lib/action-result";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UPLOAD_LIMITS } from "@/lib/upload-limits";

export function UploadDialog({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(uploadImages, IDLE);
  const [formKey, setFormKey] = useState(0);

  useActionToast(state, () => {
    setOpen(false);
    setFormKey((k) => k + 1);
  });

  const noCategories = categories.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={noCategories}>
          <Upload className="size-4" />
          Upload images
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload to the gallery</DialogTitle>
          <DialogDescription>
            Select one or more photographs. {UPLOAD_LIMITS.image.label}.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-title">Title</Label>
            <Input
              id="upload-title"
              name="title"
              placeholder="e.g. Annual Picnic — group photo"
              aria-invalid={Boolean(state.fieldErrors?.title)}
            />
            {state.fieldErrors?.title && (
              <p className="text-destructive text-sm">{state.fieldErrors.title}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Uploading several files at once numbers them automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="upload-category">Category</Label>
              <Select name="categoryId">
                <SelectTrigger id="upload-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.fieldErrors?.categoryId && (
                <p className="text-destructive text-sm">{state.fieldErrors.categoryId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-date">Event date (optional)</Label>
              <Input id="upload-date" name="eventDate" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-description">Description (optional)</Label>
            <Textarea id="upload-description" name="description" rows={2} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-files">Images</Label>
            <Input
              id="upload-files"
              name="images"
              type="file"
              multiple
              accept={UPLOAD_LIMITS.image.mimeTypes.join(",")}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch id="upload-featured" name="isFeatured" />
            <Label htmlFor="upload-featured" className="font-normal">
              Feature on the homepage
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
