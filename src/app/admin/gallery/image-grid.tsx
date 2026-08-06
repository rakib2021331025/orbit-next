"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";

import { deleteImage, updateImage } from "./actions";
import { IDLE } from "@/lib/action-result";
import { useActionToast } from "@/hooks/use-action-toast";
import { SubmitButton } from "@/components/submit-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { formatDate } from "@/lib/format";

type ImageRow = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  eventDate: Date | null;
  isFeatured: boolean;
  status: "ACTIVE" | "INACTIVE";
  category: { id: string; name: string } | null;
};

export function ImageGrid({
  images,
  categories,
}: {
  images: ImageRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const [editing, setEditing] = useState<ImageRow | null>(null);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {images.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            onEdit={() => setEditing(image)}
          />
        ))}
      </div>

      <EditDialog
        image={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function ImageCard({ image, onEdit }: { image: ImageRow; onEdit: () => void }) {
  const [state, action] = useActionState(deleteImage, IDLE);
  useActionToast(state);

  return (
    <div className="group bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted relative aspect-4/3">
        <Image
          src={image.imageUrl}
          alt={image.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
          className="object-cover"
        />
        {image.isFeatured && (
          <Badge className="absolute top-2 left-2 gap-1">
            <Star className="size-3 fill-current" />
            Featured
          </Badge>
        )}
        {image.status === "INACTIVE" && (
          <Badge variant="secondary" className="absolute top-2 right-2">
            Hidden
          </Badge>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{image.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {image.category?.name ?? "Uncategorised"}
            {image.eventDate && ` · ${formatDate(image.eventDate)}`}
          </p>
        </div>

        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive">
                <Trash2 className="size-3.5" />
                <span className="sr-only">Delete {image.title}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this image?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{image.title}&rdquo; will be removed from the gallery and
                  permanently deleted from storage. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <form action={action}>
                  <input type="hidden" name="id" value={image.id} />
                  <AlertDialogAction type="submit">Delete</AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function EditDialog({
  image,
  categories,
  onClose,
}: {
  image: ImageRow | null;
  categories: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateImage, IDLE);
  useActionToast(state, onClose);

  return (
    <Dialog open={Boolean(image)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
        </DialogHeader>

        {image && (
          // Keying by id gives each image its own fresh uncontrolled form.
          <form key={image.id} action={action} className="space-y-4">
            <input type="hidden" name="id" value={image.id} />

            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" name="title" defaultValue={image.title} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Select name="categoryId" defaultValue={image.category?.id}>
                  <SelectTrigger id="edit-category">
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-date">Event date</Label>
                <Input
                  id="edit-date"
                  name="eventDate"
                  type="date"
                  defaultValue={
                    image.eventDate
                      ? new Date(image.eventDate).toISOString().slice(0, 10)
                      : ""
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                name="description"
                rows={2}
                defaultValue={image.description ?? ""}
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <Switch
                  id="edit-featured"
                  name="isFeatured"
                  defaultChecked={image.isFeatured}
                />
                <Label htmlFor="edit-featured" className="font-normal">
                  Featured
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="edit-visible"
                  name="status"
                  value="ACTIVE"
                  defaultChecked={image.status === "ACTIVE"}
                />
                <Label htmlFor="edit-visible" className="font-normal">
                  Visible publicly
                </Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton>Save changes</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
