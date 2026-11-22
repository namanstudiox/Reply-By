import { describe, expect, it } from 'vitest';
import { analyzeNotice } from './analyze';
import eac from '../../../verification/notices/2026-22712-plain.txt?raw';
import eacPage from '../../../verification/notices/2026-22712-page.txt?raw';
import copyright from '../../../verification/notices/2026-22602-plain.txt?raw';

const read = (text: string) => analyzeNotice(text, { source: 'typed', today: '2026-11-22' });

describe('explicit clock with an optional weekday', () => {
  it('reads the EAC deadline and quotes the whole sentence', () => {
    const result = read(eac);
    expect(result.action.category).toBe('comment');
    expect(result.action.summary).toMatch(/optional/);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.date).toBe('2026-12-09');
    expect(result.deadline.time).toBe('5 p.m. Eastern');
    expect(result.deadline.evidence?.text).toBe(
      'Comments must be received by 5 p.m. Eastern on Wednesday, December 9, 2026.',
    );
  });

  it.each([
    [
      'Comments must be received by 5 p.m. Eastern on Wednesday, December 9, 2026.',
      '2026-12-09',
      '5 p.m. Eastern',
    ],
    [
      'Comments must be received by 5:00 p.m. Eastern Time on Friday, December 18, 2026.',
      '2026-12-18',
      '5:00 p.m. Eastern Time',
    ],
    [
      'Please respond by 5 p.m. Pacific on Wednesday, March 3, 2027.',
      '2027-03-03',
      '5 p.m. Pacific',
    ],
    [
      'Please respond by 5 p.m. Pacific Time on Wednesday, 3 March 2027.',
      '2027-03-03',
      '5 p.m. Pacific Time',
    ],
    [
      'Please respond by 9:30 a.m. UTC on Thursday, 4 March 2027.',
      '2027-03-04',
      '9:30 a.m. UTC',
    ],
  ])('keeps the printed clock for: %s', (text, date, time) => {
    expect(read(text).deadline).toMatchObject({
      status: 'confirmed',
      date,
      time,
      evidence: { text },
    });
  });

  it('finds the comment request on a page that also carries meeting notices', () => {
    const result = read(eacPage);
    expect(result.action.category).toBe('comment');
    expect(result.action.summary).toMatch(/optional/);
    expect(result.deadline).toMatchObject({
      status: 'confirmed',
      date: '2026-12-09',
      time: '5 p.m. Eastern',
      evidence: {
        text: 'Comments must be received by 5 p.m. Eastern on Wednesday, December 9, 2026.',
      },
    });
  });

  it('still refuses to connect a clock that is not next to the date', () => {
    const text = 'The hearing begins at 2 p.m. Please respond by December 9, 2026.';
    const result = read(text);
    expect(result.deadline.status).toBe('unconfirmed');
    expect(result.deadline.date).toBeUndefined();
    expect(result.deadline.reason).toMatch(/connection to the date is unclear/);
    expect(result.deadline.evidence?.text).toBe(text);
  });
});

describe('separate comment rounds', () => {
  it('keeps the Copyright Office initial and reply deadlines apart', () => {
    const result = read(copyright);
    expect(result.action.category).toBe('comment');
    expect(result.action.summary).toMatch(/optional/);
    expect(result.deadline.status).toBe('confirmed');
    expect(result.deadline.deadlines).toHaveLength(2);
    // The request quote must come from a current round, never the later
    // historical paragraph that names the superseded November/December dates.
    const currentRoundQuotes = result.deadline.deadlines?.map((round) => round.evidence.text) ?? [];
    expect(currentRoundQuotes).toContain(result.action.evidence?.text);
    expect(result.deadline.deadlines?.[0]).toMatchObject({
      label: 'Initial comments',
      date: '2026-12-18',
      time: '5:00 p.m. Eastern Time',
      evidence: {
        text: 'Initial written comments are due no later than 5:00 p.m. Eastern Time on Friday, December 18, 2026.',
      },
    });
    expect(result.deadline.deadlines?.[1]).toMatchObject({
      label: 'Reply comments',
      date: '2027-01-29',
      time: '11:59 p.m. Eastern Time',
      evidence: {
        text: 'Written reply comments are due no later than 11:59 p.m. Eastern Time on Friday, January 29, 2027.',
      },
    });
  });

  it('does not treat an unrelated pair of dates as separate rounds', () => {
    const text =
      'Please submit the signed form by March 1, 2027. Alternatively, file it by April 2, 2027.';
    expect(read(text).deadline.deadlines).toBeUndefined();
  });
});
