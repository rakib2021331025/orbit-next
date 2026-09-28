import type { Metadata } from 'next';
import { getLang, translate } from '@/lib/i18n';
import { BranchFormPage } from '../BranchFormPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: translate(await getLang(), 'abr.new'),
    robots: { index: false, follow: false },
  };
}

/** Adding a branch, from admin/branches.php?new=1. */
export default function NewBranchPage() {
  return <BranchFormPage branchId={0} />;
}
