// Text preparation shared by both input paths. Everything here works on the
// text that is currently on screen; quotes are taken from that same string.

export interface Segment {
  /** Position in the segment list, used to compare evidence locations. */
  index: number;
  /** Paragraph/block number, so evidence can be judged "near" the request. */
  paragraph: number;
  /** Sentence text, trimmed. Wording is unchanged; line breaks inside a
   *  sentence are shown as single spaces. */
  text: string;
}

const MONTH_WORDS =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';

const LIST_START = /^\s*(?:\(?\d{1,3}[.)]|[a-z][.)]|[-•*–—])\s+/i;

/** Keep the user's wording; normalise only line endings and non-breaking spaces. */
export function normalizeNoticeText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ABBREVIATIONS = new Set([
  'no', 'nos', 'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'ave', 'rd', 'blvd', 'inc', 'ltd', 'llc',
  'co', 'corp', 'jr', 'sr', 'vs', 'etc', 'approx', 'dept', 'ref', 'sec', 'art', 'para', 'pp',
  'vol', 'fig', 'e.g', 'i.e', 'u.s', 'u.k', 'ph.d', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul',
  'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'p', 'ex', 'a.m', 'p.m',
]);

function splitSentences(block: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < block.length) {
    const ch = block[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < block.length && /["'”’)\]»]/.test(block[j])) j += 1;
    if (j >= block.length) break;
    if (!/\s/.test(block[j])) {
      i += 1;
      continue;
    }
    const before = block.slice(0, i + 1);
    const tokenMatch = before.match(/([A-Za-z][A-Za-z.]*)\.$/);
    if (tokenMatch && ABBREVIATIONS.has(tokenMatch[1].toLowerCase())) {
      i += 1;
      continue;
    }
    if (/\b[A-Za-z]\.$/.test(before.replace(tokenMatch?.[0] ?? '', ''))) {
      // Initials such as "J. Smith" — keep the sentence together.
      i += 1;
      continue;
    }
    if (/\b\d+\.$/.test(before) && !/\d\.\d/.test(before)) {
      // "1." at the start of a numbered item is a list marker, not a full stop.
      if (/\b\d+\.$/.test(before.trim()) && /^\s*\d+\.$/.test(before)) {
        i += 1;
        continue;
      }
    }
    const next = block.slice(j).replace(/^\s+/, '');
    const nextChar = next[0];
    if (!nextChar || !/[A-Z0-9"“'‘(\[{]/.test(nextChar)) {
      i += 1;
      continue;
    }
    out.push(block.slice(start, j).trim());
    start = j;
    i = j;
  }
  const tail = block.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Split notice text into sentence-sized segments, keeping paragraph grouping. */
export function segmentText(input: string): Segment[] {
  const text = normalizeNoticeText(input).replace(/^\s*DATES\s*:\s*/gm, '\n\n');
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length) {
      blocks.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (LIST_START.test(line)) {
      flush();
      current.push(line);
      continue;
    }
    if (current.length) {
      const prev = current[current.length - 1];
      // A short line that ends like a heading starts a new block.
      const headingish =
        prev.length < 46 && /[:]$/.test(prev) && /^[A-Z0-9]/.test(line);
      if (headingish) flush();
    }
    current.push(line);
  }
  flush();

  const segments: Segment[] = [];
  blocks.forEach((block, paragraph) => {
    for (const sentence of splitSentences(block)) {
      const clean = sentence.replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      segments.push({ index: segments.length, paragraph, text: clean });
    }
  });
  return segments;
}

export const MONTH_PATTERN = MONTH_WORDS;
