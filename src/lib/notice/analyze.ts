import { addCalendarDays, findDates, formatIsoHuman, isValidIso, parseCount, todayIso } from './dates';
import { segmentText, type Segment } from './text';

export type TextSource = 'typed' | 'pdf' | 'ocr';

export type ActionCategory =
  | 'pay'
  | 'comment'
  | 'submit'
  | 'respond'
  | 'appeal'
  | 'attend'
  | 'cure'
  | 'verify'
  | 'renew'
  | 'sign'
  | 'contact'
  | 'unknown';

export interface Evidence {
  /** Verbatim sentence from the reviewed text (line breaks shown as spaces). */
  text: string;
  segmentIndex: number;
}

export interface ActionResult {
  category: ActionCategory;
  /** Plain-language description of what the sender is asking for. */
  summary: string;
  /** The request as worded in the notice, trimmed for display. */
  requested: string | null;
  evidence: Evidence | null;
}

export type DeadlineStatus = 'confirmed' | 'needs_receipt' | 'unconfirmed' | 'none';

export interface DeadlineEntry {
  /** Which round of comments this deadline belongs to, when the notice names one. */
  label: string;
  /** Stable key for two rounds in one notice ("initial", "reply"). */
  key: string;
  date: string;
  time?: string;
  evidence: Evidence;
}

export interface DeadlineResult {
  status: DeadlineStatus;
  /** ISO date when status is "confirmed". */
  date?: string;
  time?: string;
  /** More than one separately labeled deadline (for example initial and reply comments). */
  deadlines?: DeadlineEntry[];
  conflict?: boolean;
  /** Calendar days allowed, when the notice counts days. */
  days?: number;
  /** Short explanation of where the deadline comes from. */
  basis?: string;
  /** Why the deadline could not be confirmed. */
  reason?: string;
  /** Step-by-step date-only arithmetic, shown to the user. */
  calculation?: string[];
  evidence: Evidence | null;
}

export interface NoticeAnalysis {
  source: TextSource;
  sourceLabel: string;
  action: ActionResult;
  deadline: DeadlineResult;
  /** ISO date used for "has this already passed" wording, if any. */
  today: string;
}

export const SOURCE_LABELS: Record<TextSource, string> = {
  typed: 'Pasted text',
  pdf: 'Reviewed extracted text (PDF)',
  ocr: 'Reviewed extracted text (OCR)',
};

interface Rule {
  id: ActionCategory;
  summary: string;
  patterns: RegExp[];
}

// Order matters only as a tie-break: earlier rules win when two requests are
// named in the same sentence.
const RULES: Rule[] = [
  {
    id: 'pay',
    summary: 'Pay the amount this notice says is due.',
    patterns: [
      /\b(pay|payment|remit|remittance|payable|amount due|balance due|outstanding balance|owe)\b/i,
    ],
  },
  {
    id: 'cure',
    summary: 'Fix the problem the notice describes, then confirm that you have fixed it.',
    patterns: [
      /\b(cure|remedy|corrective action|correct(?:ed|ing)? the|remediat(?:e|ion)|rectify|bring (?:it |them |the [a-z]+ )?into compliance|come into compliance)\b/i,
    ],
  },
  {
    id: 'comment',
    summary: 'Public comment is optional. You may send written comments.',
    patterns: [/\bcomments?\b/i, /\bcomment period\b/i],
  },
  {
    id: 'submit',
    summary: 'Send the documents or information the notice asks for.',
    patterns: [
      /\b(submit|provide|furnish|supply|send|return|upload|deliver|forward|file)\b/i,
      /\b(complete and return|enclose|documentation|documents|information)\b/i,
    ],
  },
  {
    id: 'respond',
    summary: 'Reply to the sender in writing.',
    patterns: [
      /\b(respond|response|reply|answer|written explanation|letter of explanation|address (?:the|these) (?:issues|deficiencies|findings))\b/i,
    ],
  },
  {
    id: 'appeal',
    summary: 'Decide whether to appeal or dispute the decision, and file that if you do.',
    patterns: [/\b(appeal|contest|dispute|objection|object to|request a review|reconsideration|reconsider)\b/i],
  },
  {
    id: 'attend',
    summary: 'Attend the appointment, hearing, or inspection named in the notice.',
    patterns: [
      /\b(attend|appear (?:in person|before|at)|appointment|hearing|interview|inspection|site visit|meeting)\b/i,
    ],
  },
  {
    id: 'verify',
    summary: 'Provide proof or verification of the details the notice asks about.',
    patterns: [/\b(verify|verification|proof of|confirm your (?:identity|income|address|employment)|documentation showing)\b/i],
  },
  {
    id: 'renew',
    summary: 'Renew or reapply for the thing the notice covers.',
    patterns: [/\b(renew|renewal|reapply|re-register)\b/i],
  },
  {
    id: 'sign',
    summary: 'Sign and return the form or consent the notice includes.',
    patterns: [/\b(sign|signature|consent|authorization|authorisation|acknowledge receipt)\b/i],
  },
  {
    id: 'contact',
    summary: 'Contact the sender to update or confirm your details.',
    patterns: [/\b(update your (?:address|information|details|records)|notify (?:us|the)|inform (?:us|the)|change of address)\b/i],
  },
];

const REQUEST_BOOST =
  /\b(please|kindly|you (?:must|are required|should|need to|will need to|are asked to)|we (?:request|require|ask))\b/i;
// A sentence that opens with an instruction verb is a request even without
// "please" or "you must".
const IMPERATIVE_START =
  /^\s*(?:please\s+)?(?:pay|submit|provide|send|return|file|respond|reply|answer|appeal|renew|sign|complete|report|contact|attend|verify|update|correct|cure|remediate|notify)\b/i;
const OPERATIVE_HINT =
  /\b(?:must be (?:received|submitted|filed|sent|returned|paid)|(?:are|is) due|requests? (?:comment|comments|that|the)|asks? (?:that|you)|requires? (?:that|you)|you are (?:required|asked))\b/i;
const BACKGROUND =
  /\b(pursuant to|in accordance with|under (?:the|section|title)|Paperwork Reduction Act|Federal Register|U\.S\.C\.|\bCFR\b|\bOMB\b|this (?:notice|document) (?:announces|describes|sets out)|(?:set|sets|had set) (?:a |the )?deadline|previously|originally|was (?:requested|published|set|extended)|were requested|in response to (?:its|the|a))\b/i;
const DEADLINE_WORD =
  /\b(by|on or before|no later than|not later than|before|due|deadline|prior to)\b/i;
const CLOCK = String.raw`(?:\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*[ap]\.?m\.?|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\bnoon\b|\bmidnight\b)`;
const ZONE = String.raw`(?:\([^()]{1,45}\)|\b(?:UTC|GMT)(?:[+-]\d{1,2}(?::?\d{2})?)?|\b(?:Eastern|Pacific|Central|Mountain|local)(?:\s+(?:Standard|Daylight))?(?:\s+Time)?|\b(?:ET|PT|CT|MT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|HDT)\b)`;
const WEEKDAY = String.raw`(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)`;

/**
 * The clock printed next to a date, if there is one. The weekday between the
 * zone and the date is optional ("5 p.m. Eastern on Wednesday, December 9").
 * The wording is returned exactly as printed; time zones are never converted.
 */
function clockNear(sentence: string, iso: string): { time?: string; hasClock: boolean } {
  const hasClock = new RegExp(CLOCK, 'i').test(sentence);
  const date = findDates(sentence).find((mention) => mention.iso === iso);
  if (!date) return { hasClock };
  const before = sentence.slice(0, date.index);
  const after = sentence.slice(date.index + date.raw.length);
  const timeBefore = before.match(
    new RegExp(
      `(${CLOCK}(?:\\s*${ZONE})?)(?:[,\\s]+on\\s+(?:${WEEKDAY}[,\\s]+)?|[,\\s]+${WEEKDAY}[,\\s]+|[,\\s]*)$`,
      'i',
    ),
  )?.[1];
  const timeAfter = after.match(
    new RegExp(`^[,\\s]*(?:(?:at|by|no later than|not later than)\\s+)?(${CLOCK}(?:\\s*${ZONE})?)`, 'i'),
  )?.[1];
  return { time: (timeBefore ?? timeAfter)?.trim(), hasClock };
}
const HEADER_LINE =
  /^(?:date|dated|ref|reference|re|subject|invoice|account|case|our ref|your ref|notice date|letter date)\b[^.]{0,50}$/i;
const BOILERPLATE =
  /\b(nothing in this (?:notice|letter)|this (?:notice|letter) (?:is|serves) (?:a|an|intended)|governing law|all rights reserved|privacy (?:notice|policy))\b/i;
// Access, registration, and attendance logistics are not the notice's main request.
const LOGISTICS =
  /\b(?:to coordinate access|access to the (?:meeting|hearing|webinar)|registration|register (?:for|to|at)|rsvp|livestream|join (?:the )?(?:meeting|webinar)|attend(?:ing)? the (?:meeting|hearing))\b/i;

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  let count = 0;
  while (re.exec(text) !== null) {
    count += 1;
    if (count > 6) break;
  }
  return count;
}

function evidenceOf(seg: Segment): Evidence {
  return { text: seg.text, segmentIndex: seg.index };
}

interface ActionPick {
  segment: Segment | null;
  rule: Rule | null;
  requested: string | null;
}

function pickAction(
  segments: Segment[],
  deadlineSegments: Set<number>,
  datedSegments: Set<number>,
): ActionPick {
  let best: { segment: Segment; rule: Rule; score: number } | null = null;

  for (const seg of segments) {
    if (seg.text.length < 12) continue;
    let ruleScores: Array<{ rule: Rule; hits: number }> = [];
    for (const rule of RULES) {
      const hits = rule.patterns.reduce((total, pattern) => total + countMatches(seg.text, pattern), 0);
      if (hits > 0) ruleScores.push({ rule, hits });
    }
    if (!ruleScores.length) continue;

    const hits = ruleScores.reduce((total, item) => total + item.hits, 0);
    const imperative = IMPERATIVE_START.test(seg.text);
    const addressed = /\byou\b|\byour\b/i.test(seg.text);
    const explicitDeadline = datedSegments.has(seg.index);
    const isComment = ruleScores.some((item) => item.rule.id === 'comment');
    let score = Math.min(hits, 5) * 2;
    if (REQUEST_BOOST.test(seg.text)) score += 6;
    if (OPERATIVE_HINT.test(seg.text)) score += 4;
    if (BACKGROUND.test(seg.text)) score -= 7;
    if (deadlineSegments.has(seg.index)) score += 4;
    // A dated request is stronger than a day-count reference, and a comment
    // request with a dated deadline outranks incidental logistics on a page
    // that carries several notices.
    if (explicitDeadline) score += 8;
    if (explicitDeadline && isComment) score += 4;
    if (!explicitDeadline && LOGISTICS.test(seg.text)) score -= 10;
    if (addressed) score += 2;
    if (imperative) score += 4;
    if (seg.text.length >= 35 && seg.text.length <= 700) score += 1;
    if (HEADER_LINE.test(seg.text)) score -= 8;
    if (BOILERPLATE.test(seg.text)) score -= 6;
    if (/\bif you (?:do not|fail|wish|would like|want)\b/i.test(seg.text)) score -= 4;
    // A question in a request-for-comment notice is not itself the request.
    if (seg.text.trim().endsWith('?')) score -= 3;

    // Only report a request when the sentence is actually addressed to the
    // reader, states an operative requirement, carries a deadline, or opens
    // with an instruction. This keeps descriptive passages from becoming
    // instructions the notice never gave.
    const requestSignal =
      REQUEST_BOOST.test(seg.text) ||
      OPERATIVE_HINT.test(seg.text) ||
      deadlineSegments.has(seg.index) ||
      addressed ||
      imperative;
    if (!requestSignal || score < 6) continue;

    ruleScores = ruleScores.sort((a, b) => b.hits - a.hits);
    if (!best || score > best.score) {
      best = { segment: seg, rule: ruleScores[0].rule, score };
    }
  }

  if (!best) return { segment: null, rule: null, requested: null };

  const requested = extractRequestPhrase(best.segment.text, best.rule);
  return { segment: best.segment, rule: best.rule, requested };
}

const PHRASE_STOP =
  /\s+(?:within|by|on or before|no later than|not later than|before|at|to the|for the|in order|so that|if you|and (?:send|submit|provide)|which)\b/i;

function extractRequestPhrase(text: string, rule: Rule): string | null {
  let start = -1;
  for (const pattern of rule.patterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined && (start === -1 || match.index < start)) {
      start = match.index;
      break;
    }
  }
  if (start === -1) return null;
  let phrase = text.slice(start);
  const stop = phrase.match(PHRASE_STOP);
  if (stop?.index !== undefined && stop.index > 8) phrase = phrase.slice(0, stop.index);
  phrase = phrase.replace(/[.;,:\s]+$/, '');
  const words = phrase.split(/\s+/);
  if (words.length > 22) phrase = `${words.slice(0, 22).join(' ')}…`;
  if (phrase.length > 160) phrase = `${phrase.slice(0, 157)}…`;
  return phrase || null;
}

type RelativeUnit = 'calendar' | 'business' | 'legal' | 'hours' | 'unknown';
type RelativeAnchor = 'receipt' | 'notice' | 'decision' | 'service' | 'none';

interface RelativeMention {
  segment: Segment;
  days: number;
  unit: RelativeUnit;
  anchor: RelativeAnchor;
  anchorText: string | null;
}

const RELATIVE_RE = /\b(?:within|no later than|not later than|you (?:have|must file|must submit)|has)\s+(.{0,32}?)\b(days?|hours?)\b/gi;

function classifyUnit(prefix: string, unitWord: string): RelativeUnit {
  if (unitWord.toLowerCase().startsWith('hour')) return 'hours';
  if (/\b(calendar)\b/i.test(prefix)) return 'calendar';
  if (/\b(business|working)\b/i.test(prefix)) return 'business';
  if (/\b(court|legal|judicial)\b/i.test(prefix)) return 'legal';
  if (/\b(holiday|school)\b/i.test(prefix)) return 'legal';
  return 'calendar';
}

function classifyAnchor(window: string): { anchor: RelativeAnchor; anchorText: string | null } {
  const match = window.match(/^\s*(?:of|after|from|following|before|prior to)\s+([^.;:]{0,80})/i);
  if (!match) return { anchor: 'none', anchorText: null };
  const phrase = match[1].trim();
  if (/\breceipt\b|\breceive(?:d|s)?\b|\breceiving\b|\bdate you (?:got|receive)\b/i.test(phrase)) {
    return { anchor: 'receipt', anchorText: phrase };
  }
  if (/\bdecision\b|\border\b|\bjudg(?:e)?ment\b|\bdetermination\b|\bruling\b|\bnotice of (?:decision|intended decision)\b/i.test(phrase)) {
    return { anchor: 'decision', anchorText: phrase };
  }
  if (/\bservice\b|\bserved\b|\bmailing\b|\bmailed\b/i.test(phrase)) {
    return { anchor: 'service', anchorText: phrase };
  }
  if (/\bdate of (?:this|the) (?:notice|letter)\b|\bthis notice\b|\bthis letter\b|\bissuance\b|\bissued\b/i.test(phrase)) {
    return { anchor: 'notice', anchorText: phrase };
  }
  return { anchor: 'none', anchorText: phrase };
}

function findRelativeMentions(segments: Segment[]): RelativeMention[] {
  const mentions: RelativeMention[] = [];
  for (const seg of segments) {
    for (const match of seg.text.matchAll(RELATIVE_RE)) {
      const prefix = match[1] ?? '';
      const days = parseCount(prefix);
      if (days === null || days <= 0 || days > 3650) continue;
      const after = seg.text.slice((match.index ?? 0) + match[0].length);
      const { anchor, anchorText } = classifyAnchor(after);
      mentions.push({
        segment: seg,
        days,
        unit: classifyUnit(prefix, match[2]),
        anchor,
        anchorText,
      });
    }
  }
  return mentions;
}

interface AbsoluteMention {
  segment: Segment;
  iso: string | null;
  raw: string;
  /** Offset of the date inside its segment. */
  index: number;
  ambiguous: boolean;
  readings: string[];
  marker: boolean;
  printedDate: boolean;
}

const WEEKDAY_BEFORE = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*$/i;
// Production stamps printed by the Government Publishing Office run along the
// foot of Federal Register PDFs. They are not part of the notice.
const PRODUCTION_STAMP = /^(?:VerDate\b|Jkt \d|PO 00000|Frm \d|Sfmt \d|E:\\FR\\)/i;
const LABEL_BEFORE =
  /\b(?:date|dated|issued|issue date|reference|ref|our ref|invoice date|notice date|letter date|publication date|posted|effective)\b[\s:.#-]*$/i;

function findAbsoluteMentions(segments: Segment[]): AbsoluteMention[] {
  const mentions: AbsoluteMention[] = [];
  for (const seg of segments) {
    if (PRODUCTION_STAMP.test(seg.text)) continue;
    for (const mention of findDates(seg.text)) {
      // Wide enough to keep the deadline phrase when a clock, zone, and
      // weekday all sit between it and the date.
      const before = seg.text.slice(Math.max(0, mention.index - 72), mention.index);
      const after = seg.text.slice(mention.index + mention.raw.length, mention.index + mention.raw.length + 45);
      const marker = DEADLINE_WORD.test(before) || /\b(?:is the deadline|deadline)\b/i.test(after.slice(0, 18));
      const printedDate =
        LABEL_BEFORE.test(before) || /\b(?:issued|published|printed|dated)\s+(?:on\s+)?$/i.test(before) ||
        WEEKDAY_BEFORE.test(before) ||
        (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(seg.text.trim()) && mention.index === 0) ||
        (seg.paragraph === 0 && seg.text.length < 40);
      mentions.push({
        segment: seg,
        iso: mention.iso,
        raw: mention.raw,
        index: mention.index,
        ambiguous: mention.ambiguous,
        readings: mention.readings,
        marker,
        printedDate,
      });
    }
  }
  return mentions;
}

const EXTENSION_VERB =
  /\b(?:extend(?:s|ed|ing)?|extension|reopen(?:s|ed|ing)?|postpon(?:e|es|ed|ing)|supersed(?:e|es|ed|ing)|replac(?:e|es|ed|ing))\b/i;
const PERIOD_NOUN =
  /\b(?:comment(?:s)?|response period|reply period|appeal period|objection period|deadline|period|time (?:to|for) (?:comment|comments|respond|reply|appeal|file))\b/i;
// A proposal, request, condition, or option is not an approved extension.
const UNCONFIRMED_EXTENSION =
  /\b(?:propos(?:e|es|ed|ing)|would|could|might|may|should|if|whether|seek(?:s|ing)?|request(?:s|ed|ing)?\s+(?:an?\s+)?(?:extension|to extend)|consider(?:s|ing)?|option|plans?\s+to|intends?\s+to)\b/i;
const OPERATIVE_DEADLINE =
  /\b(?:must|shall|are to|is to)\s+be\s+(?:received|submitted|filed|sent|returned|delivered)\b|\b(?:on or before|no later than|not later than)\b|\bdeadline\b/i;

interface ExtensionFinding {
  /** The sentence that states the extension or replacement. */
  statement: Segment;
  /** The sentence that states the operative new deadline, preferred for quoting. */
  operative: Segment;
  newIso: string;
}

function isApprovedExtension(segment: Segment): boolean {
  return (
    EXTENSION_VERB.test(segment.text) &&
    PERIOD_NOUN.test(segment.text) &&
    !UNCONFIRMED_EXTENSION.test(segment.text)
  );
}

/** The date the extension points at ("until", "to", "through"), not an old one. */
function extensionTargetDate(text: string, allowBareDate = false): string | null {
  const dates = findDates(text).filter((date) => date.iso);
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const before = text.slice(Math.max(0, dates[i].index - 24), dates[i].index);
    if (/\b(?:until|through|to)\s*$/i.test(before)) return dates[i].iso;
  }
  return allowBareDate && dates.length ? dates[dates.length - 1].iso : null;
}

/** Which period is being extended, so an unrelated date is never superseded. */
function periodKey(statement: string): RegExp | null {
  if (/comment/i.test(statement)) return /comment/i;
  if (/respons|repl|respond/i.test(statement)) return /respons|repl|respond/i;
  if (/appeal|objection|contest/i.test(statement)) return /appeal|objection|contest/i;
  if (/renew/i.test(statement)) return /renew/i;
  if (/period|deadline/i.test(statement)) return /\bperiod\b|\bdeadline\b/i;
  return null;
}

function nearbyOperative(segments: Segment[], anchor: Segment, iso: string): Segment | null {
  const candidates = segments
    .filter(
      (segment) =>
        segment.index !== anchor.index &&
        Math.abs(segment.index - anchor.index) <= 3 &&
        findDates(segment.text).some((date) => date.iso === iso),
    )
    .sort((a, b) => Math.abs(a.index - anchor.index) - Math.abs(b.index - anchor.index));
  return candidates.find((segment) => OPERATIVE_DEADLINE.test(segment.text)) ?? null;
}

/** An approved statement that an existing deadline is extended or replaced. */
function findExtensionStatement(
  segments: Segment[],
  absolutes: AbsoluteMention[],
): { statement: Segment; earlier: AbsoluteMention[] } | null {
  for (const segment of segments) {
    if (!isApprovedExtension(segment)) continue;
    const key = periodKey(segment.text);
    const earlier = absolutes.filter(
      (mention) =>
        mention.iso &&
        mention.segment.index <= segment.index &&
        (mention.segment.index === segment.index || (key ? key.test(mention.segment.text) : false)),
    );
    return { statement: segment, earlier };
  }
  return null;
}

/** An extension whose new date is also stated, with the dates it supersedes. */
function findExtension(
  segments: Segment[],
  absolutes: AbsoluteMention[],
): (ExtensionFinding & { superseded: string[] }) | null {
  for (const segment of segments) {
    if (!isApprovedExtension(segment)) continue;

    let newIso = extensionTargetDate(segment.text);
    let operative: Segment | null = null;
    if (newIso) {
      operative = nearbyOperative(segments, segment, newIso) ?? segment;
    } else {
      // "The comment period is extended. Comments must be received …"
      for (const next of segments.filter(
        (candidate) => candidate.index > segment.index && candidate.index <= segment.index + 3,
      )) {
        const date = extensionTargetDate(next.text, true);
        if (!date || !OPERATIVE_DEADLINE.test(next.text)) continue;
        newIso = date;
        operative = next;
        break;
      }
    }
    if (!newIso || !operative) continue;

    const key = periodKey(segment.text);
    const superseded = absolutes
      .filter(
        (mention) =>
          mention.iso &&
          mention.iso !== newIso &&
          mention.iso < newIso! &&
          (mention.segment.index === segment.index || (key ? key.test(mention.segment.text) : false)),
      )
      .map((mention) => mention.iso as string);
    if (!superseded.length) continue;

    return { statement: segment, operative, newIso, superseded };
  }
  return null;
}

const ROUND_LABELS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'initial', label: 'Initial comments', pattern: /\binitial\b[^.;]{0,50}\bcomments?\b/gi },
  { key: 'reply', label: 'Reply comments', pattern: /\breply\b[^.;]{0,50}\bcomments?\b/gi },
  { key: 'reply', label: 'Reply comments', pattern: /\bcomments?\b[^.;]{0,20}\bin reply\b/gi },
];

/** The round label nearest before a date, so one sentence with two dates stays ordered. */
function roundLabelBefore(sentence: string, dateIndex: number): { key: string; label: string } | null {
  const before = sentence.slice(0, dateIndex);
  let best: { key: string; label: string; end: number } | null = null;
  for (const { key, label, pattern } of ROUND_LABELS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of before.matchAll(re)) {
      const end = (match.index ?? 0) + match[0].length;
      if (!best || end > best.end) best = { key, label, end };
    }
  }
  return best ? { key: best.key, label: best.label } : null;
}

/**
 * Deadlines the notice labels as different rounds of comments. The first
 * statement of each round wins, so a later historical paragraph cannot
 * replace the current DATES paragraph.
 */
function findCommentRounds(absolutes: AbsoluteMention[]): DeadlineEntry[] | null {
  const rounds = new Map<string, DeadlineEntry>();
  for (const mention of absolutes) {
    if (!mention.iso || !mention.marker) continue;
    const round = roundLabelBefore(mention.segment.text, mention.index);
    if (!round || rounds.has(round.key)) continue;
    const { time } = clockNear(mention.segment.text, mention.iso);
    rounds.set(round.key, {
      label: round.label,
      key: round.key,
      date: mention.iso,
      time,
      evidence: evidenceOf(mention.segment),
    });
  }
  if (rounds.size < 2) return null;
  const list = [...rounds.values()].sort((a, b) => a.date.localeCompare(b.date));
  return new Set(list.map((round) => round.date)).size > 1 ? list : null;
}

function nearestToAction<T extends { segment: Segment }>(items: T[], actionSegment: Segment | null): T[] {
  if (!actionSegment) return items;
  return [...items].sort((a, b) => {
    const da = Math.abs(a.segment.index - actionSegment.index);
    const db = Math.abs(b.segment.index - actionSegment.index);
    return da - db;
  });
}

/** Calendar days from the date written in a decision sentence, when both are present. */
function decisionDateIn(segment: Segment): string | null {
  const dates = findDates(segment.text).filter((date) => date.iso);
  if (dates.length !== 1) return null;
  return dates[0].iso;
}

export interface AnalyzeOptions {
  source: TextSource;
  /** ISO date-only value the user says they received the notice. */
  receiptDate?: string | null;
  /** Injectable for tests; defaults to today. */
  today?: string;
}

export function analyzeNotice(input: string, options: AnalyzeOptions): NoticeAnalysis {
  const segments = segmentText(input).filter(s => !/\b(?:notice|letter|order|agency|regulation)\b[^.;]{0,80}\b(?:may|might|could) (?:require|request|direct|specify|instruct|ask)\b/i.test(s.text));
  const source = options.source;
  const sourceLabel = SOURCE_LABELS[source];
  const today = options.today ?? todayIso();

  const relative = findRelativeMentions(segments);
  const absolutes = findAbsoluteMentions(segments);

  const deadlineSegments = new Set<number>();
  relative.forEach((mention) => deadlineSegments.add(mention.segment.index));
  absolutes.forEach((mention) => deadlineSegments.add(mention.segment.index));

  const datedSegments = new Set<number>();
  absolutes.forEach((mention) => {
    if (mention.iso && mention.marker) datedSegments.add(mention.segment.index);
  });
  const actionPick = pickAction(segments, deadlineSegments, datedSegments);
  const action: ActionResult = actionPick.rule
    ? {
        category: actionPick.rule.id,
        summary: actionPick.rule.summary,
        requested: actionPick.requested,
        evidence: actionPick.segment ? evidenceOf(actionPick.segment) : null,
      }
    : {
        category: 'unknown',
        summary: 'This text does not contain a clear request to you.',
        requested: null,
        evidence: null,
      };

  let deadline = resolveDeadline({
    segments,
    relative,
    absolutes,
    actionSegment: actionPick.segment,
    receiptDate: options.receiptDate ?? null,
  });

  // Attach only a clock adjacent to the selected date; never convert to local time.
  if (!deadline.deadlines?.length && deadline.date && deadline.evidence && !deadline.calculation) {
    const { time, hasClock } = clockNear(deadline.evidence.text, deadline.date);
    if (time) deadline.time = time;
    else if (hasClock) {
      deadline = {
        status: 'unconfirmed',
        reason: 'The wording includes a time, but its connection to the date is unclear.',
        evidence: deadline.evidence,
      };
    }
  }
  return { source, sourceLabel, action, deadline, today };
}

interface ResolveInput {
  segments: Segment[];
  relative: RelativeMention[];
  absolutes: AbsoluteMention[];
  actionSegment: Segment | null;
  receiptDate: string | null;
}

function resolveDeadline({
  segments,
  relative,
  absolutes,
  actionSegment,
  receiptDate,
}: ResolveInput): DeadlineResult {
  const isActionSentence = (segment: Segment) =>
    actionSegment !== null && segment.index === actionSegment.index;
  // A date only counts as a deadline when the notice ties it to the request:
  // either with deadline wording next to it, or inside the request sentence.
  const usableAbsolute = absolutes.filter(
    (mention) => mention.iso && (mention.marker || (!mention.printedDate && isActionSentence(mention.segment) && OPERATIVE_DEADLINE.test(mention.segment.text))) && !/\b(?:issued|published|printed|dated)\s+(?:on\s+)?$/i.test(mention.segment.text.split(mention.raw)[0]),
  );
  const receiptMentions = nearestToAction(
    relative.filter((mention) => mention.unit === 'calendar' && mention.anchor === 'receipt'),
    actionSegment,
  );
  const clockedMentions = nearestToAction(
    relative.filter((mention) => !(mention.unit === 'calendar' && mention.anchor === 'receipt')),
    actionSegment,
  );

  // 1. A day count with no calendar basis (business, working, court, hours).
  const nonCalendar = clockedMentions.find(
    (mention) => mention.unit === 'business' || mention.unit === 'legal' || mention.unit === 'hours',
  );
  if (nonCalendar) {
    const unitLabel =
      nonCalendar.unit === 'hours' ? 'hours' : nonCalendar.unit === 'legal' ? 'court/legal days' : 'business (working) days';
    return {
      status: 'unconfirmed',
      reason: `The notice counts ${unitLabel}, not calendar days. This reader only does calendar-day arithmetic and does not apply weekend, holiday, or court rules.`,
      evidence: evidenceOf(nonCalendar.segment),
    };
  }

  // 2. Calendar days counted from receipt.
  if (receiptMentions.length) {
    const days = receiptMentions[0].days;
    const distinctDays = [...new Set(receiptMentions.map((mention) => mention.days))];
    if (distinctDays.length > 1) {
      return {
        status: 'unconfirmed',
        reason: `The notice counts two different numbers of days from receipt (${distinctDays.join(
          ' and ',
        )}), so the deadline cannot be settled from the text alone.`,
        evidence: evidenceOf(receiptMentions[0].segment),
      };
    }
    const mention = receiptMentions[0];
    if (usableAbsolute.length) {
      return {
        status: 'unconfirmed',
        reason: 'The notice gives both a date and a count of days from receipt, so more than one deadline may apply.',
        evidence: evidenceOf(mention.segment),
      };
    }
    if (!receiptDate || !isValidIso(receiptDate)) {
      return {
        status: 'needs_receipt',
        days,
        basis: `Calendar days counted from the date you received the notice.`,
        reason: `This notice counts ${days} calendar days from the date you received it. Add that date below and the deadline is calculated from it.`,
        evidence: evidenceOf(mention.segment),
      };
    }
    const due = addCalendarDays(receiptDate, days);
    return {
      status: 'confirmed',
      date: due,
      days,
      basis: `${days} calendar days counted from the date you received the notice.`,
      calculation: [
        `You received it on ${formatIsoHuman(receiptDate)}.`,
        `The notice allows ${days} calendar days.`,
        `${formatIsoHuman(receiptDate)} + ${days} calendar days = ${formatIsoHuman(due)}.`,
      ],
      evidence: evidenceOf(mention.segment),
    };
  }

  // An explicit dated deadline for this request is more precise than a count
  // of days from the notice's publication date, so the latter cannot override it.
  const explicitTied = usableAbsolute.some(
    (mention) =>
      mention.marker &&
      actionSegment !== null &&
      (mention.segment.index === actionSegment.index ||
        mention.segment.paragraph === actionSegment.paragraph ||
        Math.abs(mention.segment.index - actionSegment.index) <= 1),
  );

  // 3. Calendar days counted from a decision or the notice's own date.
  const anchored = clockedMentions.find(
    (mention) => mention.unit === 'calendar' && mention.anchor !== 'none',
  );
  if (anchored && !(anchored.anchor === 'notice' && explicitTied)) {
    const anchorDate = anchored.anchor === 'decision' ? decisionDateIn(anchored.segment) : null;
    if (anchorDate) {
      const due = addCalendarDays(anchorDate, anchored.days);
      return {
        status: 'confirmed',
        date: due,
        days: anchored.days,
        basis: `${anchored.days} calendar days counted from the date printed in the notice.`,
        calculation: [
          `Date printed in the notice: ${formatIsoHuman(anchorDate)}.`,
          `The notice allows ${anchored.days} calendar days from that date.`,
          `${formatIsoHuman(anchorDate)} + ${anchored.days} calendar days = ${formatIsoHuman(due)}.`,
        ],
        evidence: evidenceOf(anchored.segment),
      };
    }
    const anchorLabel =
      anchored.anchor === 'decision'
        ? 'the date of the decision or order'
        : anchored.anchor === 'service'
          ? 'the date of service or mailing'
          : 'the date printed on the notice itself';
    return {
      status: 'unconfirmed',
      reason: `The deadline counts ${anchored.days} calendar days from ${anchorLabel}, and that date is not stated in the text you reviewed.`,
      evidence: evidenceOf(anchored.segment),
    };
  }

  // 4. Calendar days with no stated starting point.
  const floating = clockedMentions.find((mention) => mention.unit === 'calendar' && mention.anchor === 'none');
  if (floating) {
    return {
      status: 'unconfirmed',
      reason: `The notice mentions ${floating.days} days but does not say what the count starts from.`,
      evidence: evidenceOf(floating.segment),
    };
  }

  // 5. Separately labeled rounds of comments with their own deadlines.
  const rounds = findCommentRounds(usableAbsolute);
  if (rounds) {
    return {
      status: 'confirmed',
      date: rounds[0].date,
      time: rounds[0].time,
      deadlines: rounds,
      basis: 'The notice sets separate deadlines for different rounds of comments.',
      evidence: rounds[0].evidence,
    };
  }

  // 6. An approved extension or replacement of an earlier deadline. The old
  // date is only set aside when the notice itself states the relationship.
  const extension = findExtension(segments, usableAbsolute);
  if (extension) {
    const earlier = extension.superseded.map((iso) => formatIsoHuman(iso));
    const plural = earlier.length > 1;
    return {
      status: 'confirmed',
      date: extension.newIso,
      basis: earlier.length
        ? `The notice extends this deadline to the date shown, superseding the earlier date${plural ? 's' : ''} of ${earlier.join(' and ')}.`
        : 'The notice extends the deadline to the date shown.',
      evidence: evidenceOf(extension.operative),
    };
  }

  const proposal = segments.find(s => EXTENSION_VERB.test(s.text) && PERIOD_NOUN.test(s.text) && UNCONFIRMED_EXTENSION.test(s.text) && findDates(s.text).length);
  if (proposal) return {status:'unconfirmed', reason:'The text discusses a possible extension, but does not confirm that it took effect.', evidence:evidenceOf(proposal)};
  const extensionStatement = findExtensionStatement(segments, usableAbsolute);
  if (extensionStatement && extensionStatement.earlier.length) {
    return {
      status: 'unconfirmed',
      reason:
        'The notice says the deadline was extended, but the new date is not stated in the text you reviewed.',
      evidence: evidenceOf(extensionStatement.statement),
    };
  }

  // 7. An explicit date that the notice ties to the request.
  const ambiguous = absolutes.filter(
    (mention) => mention.ambiguous && (mention.marker || isActionSentence(mention.segment)),
  );
  if (ambiguous.length && !usableAbsolute.length) {
    const mention = nearestToAction(ambiguous, actionSegment)[0];
    const readings = mention.readings.length ? ` (${mention.readings.join(' or ')})` : '';
    return {
      status: 'unconfirmed',
      reason: `The notice writes the date as "${mention.raw}"${readings}. The day/month order is ambiguous, so this reader will not guess it.`,
      evidence: evidenceOf(mention.segment),
    };
  }

  const tiedToAction = usableAbsolute.filter(
    (mention) =>
      actionSegment !== null &&
      (mention.segment.index === actionSegment.index || mention.segment.paragraph === actionSegment.paragraph),
  );
  const chosen = tiedToAction.length ? tiedToAction : usableAbsolute;
  const distinct = [...new Set(chosen.map((mention) => mention.iso as string))];

  if (distinct.length > 1) {
    return {
      status: 'unconfirmed',
      conflict: true,
      reason: `The notice contains more than one possible deadline date (${distinct
        .map((iso) => formatIsoHuman(iso))
        .join(', ')}). This reader will not choose between them.`,
      evidence: evidenceOf(chosen[0].segment),
    };
  }

  if (distinct.length === 1) {
    const mention = chosen[0];
    return {
      status: 'confirmed',
      date: distinct[0],
      basis: 'The notice names this date as the deadline for the request.',
      evidence: evidenceOf(mention.segment),
      calculation: undefined,
    };
  }

  const wording = segments.find(s => /\b(?:no later than|not later than|on or before|deadline|within|(?:due|received|respond|submit|reply|pay) by)\b/i.test(s.text));
  if (wording) return {status:'unconfirmed', reason:'The wording sets a time limit, but does not give a date this reader can confirm.', evidence:evidenceOf(wording)};
  const printed = absolutes.find((mention) => mention.iso && mention.printedDate);
  if (printed) {
    return {
      status: 'unconfirmed',
      reason:
        'The notice shows a date, but that date is not stated as the deadline for the request, so it is not treated as one.',
      evidence: evidenceOf(printed.segment),
    };
  }

  return {
    status: 'none',
    reason: 'This notice does not state a deadline in the text you reviewed.',
    evidence: null,
  };
}
