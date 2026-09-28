/**
 * Navigation as data.
 *
 * The PHP headers build their menus from arrays and then print them twice — once
 * for the sidebar, once for the phone off-canvas. Keeping the same shape here
 * means the menu is defined once and rendered by whatever chrome needs it, and
 * that the filtering rules (a locked account, a branch admin, a feature that is
 * switched off) live in one place instead of in markup.
 *
 * `labelKey` is a translation key, never a finished string: the menu is built on
 * the server where t() is available, and every label must switch language with
 * the rest of the page.
 */

export interface NavItem {
  /** Stable key, matching `$active_nav` / `$active_menu` in the original. */
  key: string;
  href: string;
  labelKey: string;
  /** A Bootstrap Icons class, e.g. `bi-grid-1x2-fill`. */
  icon: string;
  /** A count to show as a pill; 0 or undefined shows nothing. */
  badge?: number;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  /** Only the admin navbar shows an icon for the group itself. */
  icon?: string;
  items: NavItem[];
}

/** Drops empty groups, so filtering never leaves a heading with nothing under it. */
export function pruneGroups(groups: NavGroup[]): NavGroup[] {
  return groups.filter((group) => group.items.length > 0);
}
