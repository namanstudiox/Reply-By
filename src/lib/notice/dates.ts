// Date-only helpers. Every calculation is done on calendar dates in UTC so a
// user's timezone can never shift a deadline by a day.

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const MONTH_LOOKUP: Record<string, number> = {};
for (let i = 0; i < MONTH_NAMES.length; i += 1) {
  MONTH_LOOKUP[MONTH_NAMES[i]] = i;
  MONTH_LOOKUP[MONTH_NAMES[i].slice(0, 3)] = i;
}
MONTH_LOOKUP.sept = 8;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIso(iso: string | null | undefined): iso is string {
  if (!iso || !ISO_DATE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m - 1);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function makeIso(year: number, monthIndex: number, day: number): string | null {
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > daysInMonth(year, monthIndex)) return null;
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addCalendarDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatIsoHuman(iso: string): string {
  const date = toUtcDate(iso);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatIsoShort(iso: string): string {
  const date = toUtcDate(iso);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Parse "15", "fifteen", "thirty-five" or "one hundred" (enough for notices). */
export function parseCount(token: string): number | null {
  const digits = token.match(/\d+/);
  if (digits) return Number(digits[0]);
  const words = token
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!words.length) return null;
  let total = 0;
  for (const word of words) {
    if (word === 'hundred') {
      total = (total || 1) * 100;
      continue;
    }
    const value = NUMBER_WORDS[word];
    if (value === undefined) return total || null;
    total += value;
  }
  return total || null;
}

export interface DateMention {
  /** ISO date when the text has one unambiguous reading. */
  iso: string | null;
  raw: string;
  /** Offset of the match inside the segment. */
  index: number;
  ambiguous: boolean;
  /** Human readings, used to explain an ambiguous numeric date. */
  readings: string[];
}

const MONTH_NAME_RE = new RegExp(
  `\\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  'gi',
);

const DAY_FIRST_RE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?,?\\s+(\\d{4})\\b`,
  'gi',
);

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const NUMERIC_RE = /\b(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})\b/g;

function expandYear(raw: string): number {
  const year = Number(raw);
  if (raw.length === 2) return year < 70 ? 2000 + year : 1900 + year;
  return year;
}

/** Find every calendar date in one sentence. */
export function findDates(text: string): DateMention[] {
  const found: DateMention[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    taken.some(([s, e]) => start < e && end > s);

  for (const match of text.matchAll(ISO_RE)) {
    const start = match.index ?? 0;
    const iso = makeIso(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!iso) continue;
    taken.push([start, start + match[0].length]);
    found.push({ iso, raw: match[0], index: start, ambiguous: false, readings: [] });
  }

  for (const match of text.matchAll(MONTH_NAME_RE)) {
    const start = match.index ?? 0;
    if (overlaps(start, start + match[0].length)) continue;
    const month = MONTH_LOOKUP[match[1].toLowerCase()];
    const iso = makeIso(Number(match[3]), month, Number(match[2]));
    if (!iso) continue;
    taken.push([start, start + match[0].length]);
    found.push({ iso, raw: match[0], index: start, ambiguous: false, readings: [] });
  }

  for (const match of text.matchAll(DAY_FIRST_RE)) {
    const start = match.index ?? 0;
    if (overlaps(start, start + match[0].length)) continue;
    const month = MONTH_LOOKUP[match[2].toLowerCase()];
    const iso = makeIso(Number(match[3]), month, Number(match[1]));
    if (!iso) continue;
    taken.push([start, start + match[0].length]);
    found.push({ iso, raw: match[0], index: start, ambiguous: false, readings: [] });
  }

  for (const match of text.matchAll(NUMERIC_RE)) {
    const start = match.index ?? 0;
    if (overlaps(start, start + match[0].length)) continue;
    const first = Number(match[1]);
    const second = Number(match[3]);
    const year = expandYear(match[4]);
    const monthFirst = makeIso(year, first - 1, second);
    const dayFirst = makeIso(year, second - 1, first);
    const readings: string[] = [];
    if (monthFirst) readings.push(`${formatIsoHuman(monthFirst)} (month/day)`);
    if (dayFirst) readings.push(`${formatIsoHuman(dayFirst)} (day/month)`);
    const raw = match[0];
    if (monthFirst && dayFirst && monthFirst !== dayFirst) {
      found.push({ iso: null, raw, index: start, ambiguous: true, readings });
    } else if (monthFirst || dayFirst) {
      found.push({
        iso: monthFirst ?? dayFirst,
        raw,
        index: start,
        ambiguous: false,
        readings: [],
      });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}
