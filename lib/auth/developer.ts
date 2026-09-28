import 'server-only';

/**
 * The developer lock on Admin → Admins.
 *
 * `ORBIT_DEVELOPER_EMAIL` is read from the environment and deliberately NOT from
 * site_settings, which is the point orbit_developer_email() makes: an admin can
 * edit every setting, so storing it as a setting would let them hand the page
 * straight back to themselves.
 *
 * With no developer address configured the page stays open to super admins —
 * otherwise a fresh install would have nobody able to create the first admin.
 */
export function developerEmail(): string {
  return (process.env.ORBIT_DEVELOPER_EMAIL ?? '').trim().toLowerCase();
}

export async function mayManageAdmins(email: string): Promise<boolean> {
  const developer = developerEmail();
  if (developer === '') return true;
  return email.trim().toLowerCase() === developer;
}
