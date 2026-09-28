import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names so a caller's class wins over a component's default.
 *
 * Plain concatenation leaves both `px-4` and `px-2` on the element and lets CSS
 * order decide, which makes a `className` prop unreliable. twMerge drops the
 * loser.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
