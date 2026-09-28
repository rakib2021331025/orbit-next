import type { Lang } from '@/lib/i18n';

/**
 * The class levels the home page offers, in display order — orbit_class_levels()
 * in includes/course_lib.php.
 *
 * Courses carry no class column, so a course belongs to a level when its English
 * or Bangla NAME mentions it ("৬ষ্ঠ শ্রেণি", "Class 6", "SSC 2027",
 * "এইচএসসি/আলিম"…). Naming a course that way in Admin → Courses is all it takes
 * to list it under the button. The patterns are the PHP app's, so both sites put
 * the same course under the same button.
 */

export interface ClassLevel {
  key: string;
  bn: string;
  en: string;
  pattern: RegExp;
}

export const CLASS_LEVELS: ClassLevel[] = [
  { key: '6', bn: '৬ষ্ঠ শ্রেণি', en: 'Class 6', pattern: /৬ষ্ঠ|ষষ্ঠ|\bclass\s*-?\s*(6|vi|six)\b|\b6th\b|\bsixth\b/iu },
  { key: '7', bn: '৭ম শ্রেণি', en: 'Class 7', pattern: /৭ম|সপ্তম|\bclass\s*-?\s*(7|vii|seven)\b|\b7th\b|\bseventh\b/iu },
  { key: '8', bn: '৮ম শ্রেণি', en: 'Class 8', pattern: /৮ম|অষ্টম|\bclass\s*-?\s*(8|viii|eight)\b|\b8th\b|\beighth\b|\bjsc\b|জেএসসি|জেডিসি/iu },
  { key: '9', bn: '৯ম শ্রেণি', en: 'Class 9', pattern: /৯ম|নবম|\bclass\s*-?\s*(9|ix|nine)\b|\b9th\b|\bninth\b/iu },
  { key: '10', bn: '১০ম শ্রেণি', en: 'Class 10', pattern: /১০ম|দশম|\bclass\s*-?\s*(10|x|ten)\b|\b10th\b|\btenth\b/iu },
  { key: 'ssc', bn: 'এসএসসি / দাখিল', en: 'SSC / Dakhil', pattern: /এসএসসি|দাখিল|\bssc\b|\bdakhil\b/iu },
  { key: 'hsc', bn: 'এইচএসসি / আলিম', en: 'HSC / Alim', pattern: /এইচএসসি|আলিম|\bhsc\b|\balim\b/iu },
  {
    key: 'admission',
    bn: 'এডমিশন',
    en: 'Admission',
    pattern:
      /এডমিশন|অ্যাডমিশন|ভর্তি\s*পরীক্ষা|ভার্সিটি|বিশ্ববিদ্যালয়|মেডিকেল|ইঞ্জিনিয়ারিং|\badmission\b|\bvarsity\b|\buniversity\b|\bmedical\b|\bengineering\b/iu,
  },
];

/** A level by its URL key (`?class=ssc`), or null for anything unknown. */
export function classLevel(key: unknown): ClassLevel | null {
  return CLASS_LEVELS.find((level) => level.key === key) ?? null;
}

export function classLabel(level: ClassLevel, lang: Lang): string {
  return lang === 'en' ? level.en : level.bn;
}

/** The courses whose name, in either language, names this level. */
export function coursesForLevel<C extends { name: string; name_bn: string | null }>(
  courses: C[],
  level: ClassLevel
): C[] {
  return courses.filter((course) => {
    const text = `${course.name ?? ''} ${course.name_bn ?? ''}`.trim();
    return text !== '' && level.pattern.test(text);
  });
}
