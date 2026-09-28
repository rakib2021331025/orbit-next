import { redirect } from 'next/navigation';

/** guardian/dashboard.php and guardian/index.php both lived here; the portal now starts at /guardian. */
export default function GuardianDashboardRedirect() {
  redirect('/guardian');
}
