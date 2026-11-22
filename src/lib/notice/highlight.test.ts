import { describe, expect, it } from 'vitest';
import { findQuoteRange } from './highlight';

describe('findQuoteRange', () => {
  it('finds an exact sentence and returns its offsets', () => {
    const text = 'Header.\nComments must be received on or before January 22, 2027.\nFooter.';
    const range = findQuoteRange(text, 'Comments must be received on or before January 22, 2027.');
    expect(range).not.toBeNull();
    expect(text.slice(range!.start, range!.end)).toBe(
      'Comments must be received on or before January 22, 2027.',
    );
  });

  it('matches a quote whose line breaks were flattened during segmentation', () => {
    const text = 'After you receive this letter, respond to this office\nin writing within 15 working days.';
    const range = findQuoteRange(
      text,
      'After you receive this letter, respond to this office in writing within 15 working days.',
    );
    expect(range).not.toBeNull();
    expect(text.slice(range!.start, range!.end)).toContain('in writing within 15 working days.');
  });

  it('returns null when the reviewed text no longer contains the sentence', () => {
    expect(findQuoteRange('Some other notice.', 'Comments are due.')).toBeNull();
    expect(findQuoteRange('', 'Comments are due.')).toBeNull();
  });
});
