import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLang, translate } from '@/lib/i18n';
import { BranchFormPage } from '../../BranchFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'abr.edit'),
    robots: { index: false, follow: false },
  };
}

/** Editing a branch, from admin/branches.php?edit=ID. */
export default async function EditBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) notFound();

  return <BranchFormPage branchId={Number(id)} />;
}
