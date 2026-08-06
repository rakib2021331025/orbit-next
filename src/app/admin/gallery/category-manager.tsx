"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { createCategory, deleteCategory, updateCategory } from "./actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: { images: number };
};

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const [createState, createAction] = useActionState(createCategory, IDLE);
  const [formKey, setFormKey] = useState(0);

  // Remounting the form is the simplest reliable reset for an uncontrolled form.
  useActionToast(createState, () => setFormKey((k) => k + 1));

  return (
    <div className="space-y-8">
      <form key={formKey} action={createAction} className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category-name">New category</Label>
            <Input
              id="category-name"
              name="name"
              placeholder="e.g. Annual Picnic 2026"
              aria-invalid={Boolean(createState.fieldErrors?.name)}
            />
            {createState.fieldErrors?.name && (
              <p className="text-destructive text-sm">{createState.fieldErrors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-description">Description (optional)</Label>
            <Input
              id="category-description"
              name="description"
              placeholder="Short summary shown on the public gallery"
            />
          </div>
        </div>
        <div className="flex items-end">
          <SubmitButton pendingLabel="Creating…" className="w-full sm:w-auto">
            <Plus className="size-4" />
            Add category
          </SubmitButton>
        </div>
      </form>

      {categories.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No categories yet. Type a name above — for example &ldquo;Annual Picnic
          2026&rdquo; — and it will be created instantly.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {categories.map((category) => (
            <CategoryRowItem key={category.id} category={category} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRowItem({ category }: { category: CategoryRow }) {
  const [updateState, updateAction] = useActionState(updateCategory, IDLE);
  const [deleteState, deleteAction] = useActionState(deleteCategory, IDLE);
  const [editing, setEditing] = useState(false);

  useActionToast(updateState, () => setEditing(false));
  useActionToast(deleteState);

  if (editing) {
    return (
      <li className="p-4">
        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="id" value={category.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`name-${category.id}`}>Name</Label>
              <Input id={`name-${category.id}`} name="name" defaultValue={category.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`desc-${category.id}`}>Description</Label>
              <Textarea
                id={`desc-${category.id}`}
                name="description"
                rows={2}
                defaultValue={category.description ?? ""}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id={`active-${category.id}`} name="isActive" defaultChecked={category.isActive} />
            <Label htmlFor={`active-${category.id}`} className="font-normal">
              Visible on the public gallery
            </Label>
          </div>
          <div className="flex gap-2">
            <SubmitButton size="sm">Save</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{category.name}</p>
          {!category.isActive && <Badge variant="secondary">Hidden</Badge>}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {category._count.images} image{category._count.images === 1 ? "" : "s"}
          {category.description && ` · ${category.description}`}
        </p>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2 className="size-4" />
              <span className="sr-only">Delete {category.name}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                {category._count.images > 0
                  ? `The ${category._count.images} image(s) in this category will be kept but left uncategorised. You can reassign them afterwards.`
                  : "This category is empty and will be removed."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={category.id} />
                <AlertDialogAction type="submit">Delete</AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
