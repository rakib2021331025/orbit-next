"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertRole } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { deleteFile, uploadFile } from "@/lib/storage";
import { ok, toActionState, type ActionState } from "@/lib/action-result";
import { optionalText } from "@/lib/validation";

/**
 * Gallery management.
 *
 * The legacy admin offered six hardcoded categories in a <select>
 * (admin/gallery_add.php:113-121). Categories are now rows: an admin can type
 * "Annual Picnic 2026" and the category is created on the spot.
 */

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(80),
  description: optionalText,
});

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");
    const data = categorySchema.parse({
      name: formData.get("name"),
      description: formData.get("description"),
    });

    const existing = await prisma.galleryCategory.findFirst({
      where: { name: { equals: data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      return { status: "error", message: "A category with that name already exists." };
    }

    const count = await prisma.galleryCategory.count();
    await prisma.galleryCategory.create({
      data: { ...data, slug: await uniqueSlug(data.name), sortOrder: count },
    });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return ok(`Category "${data.name}" created.`);
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");
    const id = String(formData.get("id") ?? "");
    const data = categorySchema
      .extend({ isActive: z.coerce.boolean().default(true) })
      .parse({
        name: formData.get("name"),
        description: formData.get("description"),
        isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
      });

    await prisma.galleryCategory.update({ where: { id }, data });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return ok("Category updated.");
  } catch (error) {
    return toActionState(error);
  }
}

/**
 * Deletes a category. Images are detached rather than deleted — losing a
 * category label must never silently destroy the photographs.
 */
export async function deleteCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");
    const id = String(formData.get("id") ?? "");

    const detached = await prisma.galleryImage.count({ where: { categoryId: id } });
    await prisma.galleryCategory.delete({ where: { id } });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    // The schema's onDelete: SetNull keeps the images and clears their
    // categoryId; they show as uncategorised until reassigned.
    return ok(
      detached > 0
        ? `Category deleted. ${detached} image(s) kept and left uncategorised.`
        : "Category deleted.",
    );
  } catch (error) {
    return toActionState(error);
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const imageSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(160),
  description: optionalText,
  categoryId: z.string().trim().min(1, "Choose a category."),
  eventDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  isFeatured: z.coerce.boolean().default(false),
});

export async function uploadImages(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");

    const meta = imageSchema.parse({
      title: formData.get("title"),
      description: formData.get("description"),
      categoryId: formData.get("categoryId"),
      eventDate: formData.get("eventDate") ?? "",
      isFeatured: formData.get("isFeatured") === "on",
    });

    const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      return { status: "error", message: "Choose at least one image to upload." };
    }

    const startOrder = await prisma.galleryImage.count({
      where: { categoryId: meta.categoryId },
    });

    // Uploaded sequentially rather than in parallel: a batch of 10 MB images
    // in flight at once is a reliable way to exhaust a serverless function's
    // memory limit.
    let index = 0;
    for (const file of files) {
      const uploaded = await uploadFile(file, "gallery", "image");
      await prisma.galleryImage.create({
        data: {
          ...meta,
          // Multiple files share one title, so number them for distinctness.
          title: files.length > 1 ? `${meta.title} (${index + 1})` : meta.title,
          imageUrl: uploaded.url,
          blobPath: uploaded.pathname,
          sortOrder: startOrder + index,
        },
      });
      index += 1;
    }

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return ok(`${files.length} image(s) uploaded.`);
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateImage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");
    const id = String(formData.get("id") ?? "");
    const data = imageSchema
      .extend({ status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE") })
      .parse({
        title: formData.get("title"),
        description: formData.get("description"),
        categoryId: formData.get("categoryId"),
        eventDate: formData.get("eventDate") ?? "",
        isFeatured: formData.get("isFeatured") === "on",
        // An unchecked switch submits nothing at all, so absence means hidden.
        status: formData.get("status") === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      });

    await prisma.galleryImage.update({ where: { id }, data });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return ok("Image updated.");
  } catch (error) {
    return toActionState(error);
  }
}

/** Deletes the row *and* the underlying blob, so storage doesn't leak. */
export async function deleteImage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole("ADMIN");
    const id = String(formData.get("id") ?? "");

    const image = await prisma.galleryImage.delete({ where: { id } });
    await deleteFile(image.blobPath ?? image.imageUrl);

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    return ok("Image deleted.");
  } catch (error) {
    return toActionState(error);
  }
}

/** Appends -2, -3, … until the slug is free. */
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (await prisma.galleryCategory.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}
