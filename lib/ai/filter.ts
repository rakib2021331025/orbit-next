/**
 * Layer 1 of Orbit Academic AI: the topic filter, from
 * includes/academic_ai_lib.php.
 *
 * The assistant is academic-only. Two layers enforce that, and this is the cheap
 * one — a keyword pass that runs before any request is made, so a clearly
 * off-topic question costs nothing and is refused instantly.
 *
 * The design that matters:
 *
 *   - **The off-topic list is deliberately narrow.** Every entry names a REQUEST
 *     that cannot be a study question ("tell me a joke", "which phone should i
 *     buy"), not a subject that merely sounds unserious. "The economics of
 *     gambling" and "the biology of a disease" are schoolwork.
 *   - **An academic signal beats an off-topic one.** A question that trips both
 *     lists is treated as academic, because the cost of refusing a real question
 *     is much higher than the cost of answering a borderline one.
 *   - **Structure is a signal.** An equation, a code block or a maths symbol is a
 *     study question whatever words surround it.
 *   - **`unknown` is not `blocked`.** Anything the filter cannot judge goes
 *     through to the model, whose system instruction is the real boundary.
 */

export type Verdict = 'academic' | 'blocked' | 'unknown';
export type AiLanguage = 'bn' | 'banglish' | 'en';

/**
 * The student's language, decided from their message alone.
 *
 * Markers are matched WITH their surrounding spaces, so "ski" does not read as
 * the Banglish "ki" and "their" not as "ei".
 */
export function detectLanguage(text: string): AiLanguage {
  // Any Bengali code point at all means they are writing Bangla.
  if (/[ঀ-৿]/.test(text)) return 'bn';

  const lower = ` ${text.trim().toLowerCase()} `;
  const banglish = [
    ' ki ', ' kivabe ', ' kibhabe ', ' kemne ', ' kemon ', ' bujhai', ' bujhiye', ' bujhao',
    ' bolo ', ' koro ', ' korbo ', ' korte ', ' kore ', ' hoise ', ' hobe ', ' hoy ',
    ' ache ', ' achhe ', ' amar ', ' amake ', ' tumi ', ' tomar ', ' eta ', ' oita ',
    ' jonno ', ' dao ', ' lagbe ', ' parbo ', ' keno ', ' kothay ', ' kobe ',
    ' shikhte ', ' sikhte ', ' porte ', ' niye ', ' theke ', ' onek ', ' valo ',
    ' bhalo ', ' kichu ', ' kisu ', ' kore?', ' ki?',
  ];
  return banglish.some((marker) => lower.includes(marker)) ? 'banglish' : 'en';
}

/** Subjects and the verbs students use when they want to learn. */
const ACADEMIC = [
  // English subjects and academic verbs
  'math', 'algebra', 'geometry', 'calculus', 'trigonometry', 'equation', 'theorem',
  'physics', 'chemistry', 'biology', 'science', 'formula', 'reaction', 'molecule',
  'photosynthesis', 'gravity', 'velocity', 'acceleration', 'newton', 'atom', 'cell',
  'ict', 'computer', 'programming', 'algorithm', 'data structure', 'database', 'sql',
  'python', 'java', 'javascript', 'html', 'css', 'php', 'c++', 'recursion', 'loop',
  'function', 'polymorphism', 'inheritance', 'compiler', 'network', 'tcp', 'udp',
  'grammar', 'tense', 'essay', 'paragraph', 'translation', 'literature', 'poem',
  'history', 'geography', 'economics', 'accounting', 'statistics', 'probability',
  'explain', 'solve', 'define', 'definition', 'derive', 'prove', 'calculate', 'compute',
  'difference between', 'example of', 'meaning of', 'how does', 'why does', 'what is',
  'exam', 'syllabus', 'homework', 'assignment', 'mcq', 'chapter', 'study', 'revision',
  'question', 'answer', 'concept', 'theory', 'practice', 'problem',
  // Bangla
  'গণিত', 'বীজগণিত', 'জ্যামিতি', 'সমীকরণ', 'উপপাদ্য', 'পদার্থ', 'রসায়ন', 'জীববিজ্ঞান',
  'বিজ্ঞান', 'সূত্র', 'বিক্রিয়া', 'অণু', 'পরমাণু', 'কোষ', 'সালোকসংশ্লেষণ', 'মাধ্যাকর্ষণ',
  'বেগ', 'ত্বরণ', 'ভেক্টর', 'তথ্যপ্রযুক্তি', 'প্রোগ্রামিং', 'অ্যালগরিদম', 'ডেটাবেজ',
  'ব্যাকরণ', 'অনুবাদ', 'সাহিত্য', 'কবিতা', 'রচনা', 'ইতিহাস', 'ভূগোল', 'অর্থনীতি',
  'হিসাববিজ্ঞান', 'পরিসংখ্যান', 'ব্যাখ্যা', 'বুঝিয়ে', 'বুঝাও', 'সমাধান', 'প্রমাণ',
  'সংজ্ঞা', 'নির্ণয়', 'পরীক্ষা', 'সিলেবাস', 'অধ্যায়', 'পড়াশোনা', 'প্রশ্ন', 'উত্তর',
  'ধারণা', 'তত্ত্ব', 'উদাহরণ', 'পার্থক্য', 'কাকে বলে', 'কী', 'কেন',
  // Banglish
  'bujhai', 'bujhao', 'bujhiye', 'solve koro', 'ber koro', 'kake bole', 'partho',
  'onko', 'ongko', 'porikkha', 'porasona', 'poroshona', 'proshno', 'uttor', 'niyom',
  'sutro', 'oddhay', 'shikhte', 'sikhte',
];

/**
 * Requests that cannot be study questions.
 *
 * Each entry names an ASK, not a topic — that is what keeps "the history of an
 * election" answerable while "who should i vote for" is not.
 */
const OFF_TOPIC = [
  // entertainment / chit-chat
  'tell me a joke', 'joke bolo', 'funny story', 'sing a song', 'write a poem for my crush',
  'জোক', 'কৌতুক', 'মজার গল্প', 'gan gao', 'movie recommend', 'web series', 'netflix',
  // relationships
  'relationship advice', 'girlfriend', 'boyfriend', 'my crush', 'propose', 'love letter',
  'breakup', 'dating', 'প্রেম', 'প্রেমিকা', 'প্রেমিক', 'বিয়ে করব', 'jhogra hoise',
  'premik', 'premika', 'valobasha', 'bhalobasha',
  // gambling / betting
  'gamble', 'gambling', 'betting', 'bet on', 'casino', 'lottery', 'জুয়া', 'বাজি ধর',
  'juya', 'baji dhor', 'teen patti', 'rummy',
  // money / market advice
  'stock should i buy', 'share should i buy', 'stock to buy', 'coin should i buy',
  'invest my money', 'crypto to buy', 'crypto should i buy',
  'bitcoin price prediction', 'forex tips', 'শেয়ার কিনব', 'কোন শেয়ার',
  // politics / news / opinion
  'who should i vote', 'vote for', 'political news', 'latest news', 'election result',
  'কাকে ভোট', 'রাজনৈতিক খবর', 'সর্বশেষ খবর', 'ke vote dibo', 'political situation',
  // sport and shopping opinion
  'best football player', 'best cricketer', 'who is the best player', 'sera khelowar',
  'সেরা খেলোয়াড়', 'what should i buy', 'which phone should i buy', 'kon phone kinbo',
  // adult / illegal
  'adult content', 'porn', 'nude', 'sex story', 'how to hack', 'crack software',
  'pirated', 'bypass password', 'make a bomb', 'buy drugs', 'হ্যাক করব', 'নেশা',
  // medical / personal advice
  'diagnose my', 'what disease do i have', 'prescribe me', 'medicine for my',
  'আমার কী রোগ', 'ওষুধ দাও',
  // horoscope
  'horoscope', 'zodiac', 'রাশিফল', 'rashifol',
];

export interface Classification {
  verdict: Verdict;
  language: AiLanguage;
}

export function classify(text: string): Classification {
  const language = detectLanguage(text);
  const lower = ` ${text.trim().toLowerCase()} `;

  // Structure alone is enough: an equation or a code block is schoolwork
  // whatever words surround it.
  const structural =
    /[0-9]\s*[+\-*/^=]\s*[0-9a-zαβγπ]/i.test(text) ||
    /\b[a-z]\s*[²³]\s*[+-]/i.test(text) ||
    /(```|\bdef\s|\bclass\s|\bselect\s+.*\bfrom\b|\bfor\s*\(|\bprint\s*\(|\bint\s+main\b)/i.test(text) ||
    /[∫∑√±≤≥≠∞π]/u.test(text);

  const hasAcademic = structural || ACADEMIC.some((needle) => lower.includes(needle));
  const hasOffTopic = OFF_TOPIC.some((needle) => lower.includes(needle));

  // An academic signal wins: refusing a real question costs more than answering
  // a borderline one.
  if (hasOffTopic && !hasAcademic) return { verdict: 'blocked', language };
  if (hasAcademic) return { verdict: 'academic', language };
  // Undecided goes to the model, whose instruction is the real boundary.
  return { verdict: 'unknown', language };
}

/** The one-sentence refusal, in the student's own language. */
export function refusal(language: AiLanguage): string {
  return language === 'en'
    ? 'I’m Orbit Academic AI. I can help with academic and study-related questions. Please ask me an academic question.'
    : 'আমি Orbit Academic AI। আমি শুধুমাত্র পড়াশোনা ও academic বিষয়ের প্রশ্নে সাহায্য করতে পারি। অনুগ্রহ করে একটি academic প্রশ্ন করুন।';
}
