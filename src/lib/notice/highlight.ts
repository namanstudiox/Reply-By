// Locates an evidence sentence inside the reviewed text so the reading pane can
// mark the exact wording. Segmentation joins wrapped lines with single spaces,
// while the displayed notice keeps its own line breaks, so matching ignores
// whitespace differences only.

export interface QuoteRange {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findQuoteRange(text: string, quote: string): QuoteRange | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !text) return null;

  const pattern = words.map(escapeRegExp).join('\\s+');
  const re = new RegExp(pattern, 'g');
  const match = re.exec(text);
  if (match && re.exec(text)) return null; // Repeated wording has no unique location.
  if (!match || match.index === undefined) return null;

  return { start: match.index, end: match.index + match[0].length };
}
