/**
 * Where a promotion can appear, and the colour styles it can use.
 *
 * Kept out of the actions file because a `'use server'` module may export only
 * async functions — a constant there breaks the build as soon as a server
 * component imports it.
 */

export const PROMOTION_POSITIONS = ['top_bar', 'hero', 'home_section', 'popup'] as const;
export type PromotionPosition = (typeof PROMOTION_POSITIONS)[number];

export const PROMOTION_STYLES = ['green', 'yellow', 'dark', 'light'] as const;
export type PromotionStyleName = (typeof PROMOTION_STYLES)[number];

/** live | scheduled | expired | off — exactly as promo_state() reads it. */
export function promotionState(
  promotion: { is_active: boolean; start_at: Date | null; end_at: Date | null },
  now = new Date()
): 'live' | 'scheduled' | 'expired' | 'off' {
  if (!promotion.is_active) return 'off';
  if (promotion.start_at !== null && promotion.start_at > now) return 'scheduled';
  if (promotion.end_at !== null && promotion.end_at < now) return 'expired';
  return 'live';
}
