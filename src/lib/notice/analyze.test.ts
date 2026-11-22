import { describe, expect, it } from 'vitest';
import { analyzeNotice } from './analyze';

const base = { source: 'typed' as const, today: '2026-11-21' };

describe('action and evidence', () => {
  it('names the request and quotes the sentence word for word', () => {
    const text =
      'Our records show an unpaid balance of £420.00.\n\nPlease pay the amount shown above by 15 January 2027.';
    const result = analyzeNotice(text, base);
    expect(result.action.category).toBe('pay');
    expect(result.action.evidence?.text).toBe('Please pay the amount shown above by 15 January 2027.');
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2027-01-15');
    expect(result.deadline.evidence?.text).toBe(result.action.evidence?.text);
  });

  it('reports an unknown request instead of inventing one', () => {
    const result = analyzeNotice('This page was intentionally left blank.', base);
    expect(result.action.category).toBe('unknown');
    expect(result.action.evidence).toBeNull();
    expect(result.deadline.status).toBe('none');
  });

  it('does not turn a description of benefits into a request', () => {
    const text =
      'In order to administer these benefits to caregivers, it is necessary that VA receive information about the nature of benefits being sought and the persons who apply to receive these benefits.';
    const result = analyzeNotice(text, base);
    expect(result.action.category).toBe('unknown');
    expect(result.action.evidence).toBeNull();
  });

  it('labels OCR text as reviewed extracted text', () => {
    const result = analyzeNotice('You must respond within 10 days of receipt.', {
      source: 'ocr',
      today: '2026-11-21',
    });
    expect(result.sourceLabel).toBe('Reviewed extracted text (OCR)');
  });
});

describe('deadline rules', () => {
  it('asks for a receipt date when the notice counts calendar days from receipt, then computes it', () => {
    const text = 'You must send a written response within 30 calendar days of receipt of this letter.';
    const waiting = analyzeNotice(text, base);
    expect(waiting.deadline.status).toBe('needs_receipt');
    expect(waiting.deadline.days).toBe(30);

    const computed = analyzeNotice(text, { ...base, receiptDate: '2026-11-03' });
    expect(computed.deadline.status).toBe('confirmed');
    expect(computed.deadline.date).toBe('2026-12-03');
    expect(computed.deadline.calculation).toContain(
      '3 November 2026 + 30 calendar days = 3 December 2026.',
    );
  });

  it('updates the computed date when the receipt date changes', () => {
    const text = 'You must send a written response within 14 calendar days after receipt of this notice.';
    const first = analyzeNotice(text, { ...base, receiptDate: '2026-11-01' });
    const second = analyzeNotice(text, { ...base, receiptDate: '2026-11-20' });
    expect(first.deadline.date).toBe('2026-11-15');
    expect(second.deadline.date).toBe('2026-12-04');
  });

  it('refuses to compute business-day deadlines', () => {
    const text = 'You must respond in writing within 15 working days of receipt of this letter.';
    const result = analyzeNotice(text, { ...base, receiptDate: '2026-11-03' });
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/business \(working\) days/);
    expect(result.deadline.date).toBeUndefined();
  });

  it('does not treat a printed date as a deadline', () => {
    const text = [
      'Date: March 5, 2027',
      'Dear Ms. Smith,',
      'Our records show a balance due.',
      'Please pay the amount shown above.',
    ].join('\n\n');
    const result = analyzeNotice(text, base);
    expect(result.action.category).toBe('pay');
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.date).toBeUndefined();
    expect(result.deadline.reason).toMatch(/not stated as the deadline/);
  });

  it('refuses to choose between two stated deadlines', () => {
    const text =
      'Please submit the signed form by March 1, 2027. Alternatively, file it by April 2, 2027.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/more than one possible deadline/);
  });

  it('refuses to guess an ambiguous numeric date', () => {
    const result = analyzeNotice('Please pay the balance by 03/04/2027.', base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toContain('03/04/2027');
    expect(result.deadline.reason).toMatch(/ambiguous/);
  });

  it('will not compute days counted from the notice date itself', () => {
    const result = analyzeNotice('You must respond within 30 days of the date of this notice.', base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/date printed on the notice/);
  });

  it('says when a day count has no stated starting point', () => {
    const result = analyzeNotice('Please reply within 14 days.', base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/does not say what the count starts from/);
  });

  it('computes calendar days from a decision date printed in the notice', () => {
    const text = 'You must appeal within 30 calendar days of the decision dated March 3, 2027.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2027-04-02');
    expect(result.deadline.calculation?.join(' ')).toContain('3 March 2027 + 30 calendar days');
  });
});

describe('extended deadlines', () => {
  const extended = [
    'Public comments were requested by November 16, 2026.',
    'The agencies have determined that an extension of the comment period until December 16, 2026, is appropriate.',
    'Comments must be received on or before December 16, 2026.',
  ].join(' ');

  it('uses the extended date instead of treating the two dates as conflicting', () => {
    const result = analyzeNotice(extended, base);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2026-12-16');
    expect(result.deadline.basis).toMatch(/superseding the earlier date of 16 November 2026/);
  });

  it('quotes the sentence that states the current deadline verbatim', () => {
    const result = analyzeNotice(extended, base);
    expect(result.deadline.evidence?.text).toBe(
      'Comments must be received on or before December 16, 2026.',
    );
  });

  it('follows a stated extension to the next sentence that names the new date', () => {
    const text =
      'The comment period for the September 15, 2026 notice is extended. Comments must be received on or before January 8, 2027.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2027-01-08');
  });

  it('does not treat a proposed extension as an approved one', () => {
    const text =
      'Public comments were requested by November 16, 2026. The agencies propose to extend the comment period until December 16, 2026.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).not.toBe('confirmed');
    expect(result.deadline.date).not.toBe('2026-12-16');
  });

  it('stays unconfirmed when the notice says the deadline was extended but gives no new date', () => {
    const text =
      'Public comments were requested by November 16, 2026. The comment period is extended and the new date will be announced.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/new date is not stated/);
    expect(result.deadline.date).toBeUndefined();
  });

  it('does not let an extension of one period supersede an unrelated deadline', () => {
    const text =
      'Please pay the balance by March 1, 2027. The comment period is extended until April 2, 2027.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2027-03-01');
  });

  it('still refuses to choose between two dates with no stated relationship', () => {
    const text =
      'Public comments were requested by November 16, 2026. Comments may also be sent by December 16, 2026.';
    const result = analyzeNotice(text, base);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.reason).toMatch(/more than one possible deadline/);
  });

  it('presents public comment as optional', () => {
    const result = analyzeNotice(extended, base);
    expect(result.action.category).toBe('comment');
    expect(result.action.summary).toMatch(/optional/);
  });
});
