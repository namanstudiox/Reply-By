import { expect, it } from 'vitest';
import { analyzeNotice } from './analyze';
import acus from '../../../verification/notices/2026-21742.txt?raw';
import extended from '../../../verification/notices/2026-23416.txt?raw';
const read = (s: string) => analyzeNotice(s, {source:'typed'});
const quote = 'Written comments must be received no later than 10:00 a.m. (ET) December 28, 2026.';
it.each([quote, acus])('preserves the ACUS deadline and complete proof', text => {
  const r = read(text); expect(r.action.category).toBe('comment'); expect(r.deadline).toMatchObject({date:'2026-12-28',time:'10:00 a.m. (ET)', evidence:{text:quote}});
});
it('reads the full extension PDF text', () => {const r=read(extended);expect(r.action.category).toBe('comment'); expect(r.deadline).toMatchObject({date:'2026-12-16',evidence:{text:'Comments must be received on or before December 16, 2026.'}})});
it.each(['by 5 p.m. Pacific Time on 3 March 2027','by 3 March 2027 at 5 p.m. Pacific Time'])('preserves clock after or before date: %s', clause => {expect(read(`Please respond ${clause}.`).deadline).toMatchObject({date:'2027-03-03',time:'5 p.m. Pacific Time'})});
it('quotes unresolved deadline wording',()=>{const text='Please respond no later than the next sitting.';expect(read(text).deadline).toMatchObject({status:'unconfirmed',evidence:{text}})});
it('does not turn a regulation describing another notice into a request',()=>{const r=read('The notice may require you to submit documents within 30 days of receipt.');expect(r.action.category).toBe('unknown');expect(r.deadline.date).toBeUndefined();expect(r.deadline.status).not.toBe('needs_receipt')});
it('does not borrow an issue date for a request',()=>expect(read('Please respond to the notice issued on March 3, 2027.').deadline.date).toBeUndefined());
