import type { Metadata } from "next";
import { FolderOpen, ImageIcon } from "lucide-react";

import { CategoryManager } from "./category-manager";
import { ImageGrid } from "./image-grid";
import { UploadDialog } from "./upload-dialog";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Gallery" };
export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
  const [categories, images] = await Promise.all([
    prisma.galleryCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { images: true } } },
    }),
    prisma.galleryImage.findMany({
      orderBy: { createdAt: "desc" },
      include: { category: { select: { id: true, name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Create your own categories and upload photographs. Nothing is hardcoded — add as many categories as you like."
        action={<UploadDialog categories={categories} />}
      />

      <Tabs defaultValue="images">
        <TabsList>
          <TabsTrigger value="images">
            <ImageIcon className="size-4" />
            Images ({images.length})
          </TabsTrigger>
          <TabsTrigger value="categories">
            <FolderOpen className="size-4" />
            Categories ({categories.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="images" className="mt-4">
          {images.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
                <div className="bg-muted flex size-12 items-center justify-center rounded-full">
                  <ImageIcon className="size-6" />
                </div>
                <div>
                  <p className="text-foreground font-medium">No images yet</p>
                  <p className="text-sm">
                    {categories.length === 0
                      ? "Create a category first, then upload your photographs."
                      : "Upload your first photographs to get started."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <ImageGrid images={images} categories={categories} />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryManager categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
