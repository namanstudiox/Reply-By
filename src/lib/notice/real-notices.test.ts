// Checks against genuine, publicly published notices stored in verification/.
// They are documentation fixtures, not part of the app bundle.
import { describe, expect, it } from 'vitest';
import fdaText from '../../../verification/notices/fda-warning-letter-ido-pharm.txt?raw';
import frText from '../../../verification/notices/federal-register-comment-notice.txt?raw';
import eoirText from '../../../verification/notices/eoir-notice-of-appeal.txt?raw';
import extensionText from '../../../verification/notices/fr-extension-of-comment-period.txt?raw';
import { analyzeNotice } from './analyze';

const options = { source: 'pdf' as const, today: '2026-11-21' };

describe('Federal Register notice (real text layer)', () => {
  const result = analyzeNotice(frText, options);

  it('finds the comment request and the explicit due date', () => {
    expect(result.action.category).toBe('comment');
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2027-01-22');
  });

  it('quotes the deadline sentence from the document', () => {
    expect(result.deadline.evidence?.text).toContain(
      'Comments must be received on or before January 22, 2027',
    );
    expect(frText.replace(/\s+/g, ' ')).toContain(result.deadline.evidence!.text);
  });

  it('does not turn the printed publication date into a deadline', () => {
    expect(result.deadline.evidence?.text).not.toContain('Monday, November 23, 2026');
  });
});

describe('FDA warning letter (real public notice)', () => {
  const result = analyzeNotice(fdaText, options);

  it('finds the written response request and quotes the notice', () => {
    expect(result.action.category).not.toBe('unknown');
    const quote = result.action.evidence?.text;
    expect(quote).toBeTruthy();
    expect(fdaText.replace(/\s+/g, ' ')).toContain(quote!);
  });

  it('refuses to compute a business-day deadline and says why', () => {
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/business \(working\) days/);
    expect(result.deadline.date).toBeUndefined();
  });
});

describe('EOIR notice of appeal instructions (real public document)', () => {
  const result = analyzeNotice(eoirText, options);

  it('does not invent a deadline from a day count that starts outside the text', () => {
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.date).toBeUndefined();
    expect(result.deadline.evidence).not.toBeNull();
  });
});

describe('Federal Register extension of comment period (real notice excerpt)', () => {
  const result = analyzeNotice(extensionText, options);

  it('resolves the extension to the current deadline, not the superseded one', () => {
    expect(result.action.category).toBe('comment');
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2026-12-16');
  });

  it('quotes the sentence that states the current deadline verbatim', () => {
    expect(result.deadline.evidence?.text).toBe(
      'Comments must be received on or before December 16, 2026.',
    );
    expect(extensionText.replace(/\s+/g, ' ')).toContain(result.deadline.evidence!.text);
  });

  it('describes public comment as optional', () => {
    expect(result.action.summary).toMatch(/optional/);
  });
});
