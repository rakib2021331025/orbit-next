import { SiteFooter } from '@/components/site/SiteFooter';

/**
 * The public site's shell.
 *
 * The header is NOT here: it needs to know which nav item is current, and a
 * layout does not know which page rendered under it. Each page renders
 * `<SiteHeader active="..." />` itself — one line, and the highlight is right.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {children}
      <SiteFooter />
    </div>
  );
}
