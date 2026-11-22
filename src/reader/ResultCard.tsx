import { formatIsoHuman } from '../lib/notice/dates';
import type { Evidence, NoticeAnalysis } from '../lib/notice/analyze';

export type EvidenceKey = 'action' | 'deadline' | `deadline-${number}`;

interface Props {
  analysis: NoticeAnalysis;
  receiptDate: string;
  onReceiptDateChange: (value: string) => void;
  revealed: EvidenceKey | null;
  onReveal: (key: EvidenceKey | null) => void;
  showInlineQuote: boolean;
}

function Quote({ evidence, srOnly }: { evidence: Evidence; srOnly: boolean }) {
  return (
    <figure className={`rb-redline__quote${srOnly ? ' visually-hidden' : ''}`}>
      <blockquote>
        <p>“{evidence.text}”</p>
      </blockquote>
      <figcaption>From the reviewed text</figcaption>
    </figure>
  );
}

export default function ResultCard({
  analysis,
  receiptDate,
  onReceiptDateChange,
  revealed,
  onReveal,
  showInlineQuote,
}: Props) {
  const { action, deadline, today } = analysis;

  const actionEvidence = action.evidence;
  const direct = action.category !== 'unknown' && actionEvidence !== null;
  const deadlineEvidence = deadline.evidence;
  const rounds = deadline.deadlines && deadline.deadlines.length > 1 ? deadline.deadlines : null;
  const confirmed = !rounds && deadline.status === 'confirmed' && deadline.date ? deadline.date : null;
  const alreadyPassed = confirmed !== null && confirmed < today;
  const receiptBased =
    deadline.status === 'needs_receipt' ||
    (confirmed !== null && Boolean(deadline.calculation?.[0]?.startsWith('You received it on')));
  // One sentence can both ask and set the date; then one link covers both.
  const sameSentence = Boolean(
    !rounds &&
      actionEvidence &&
      deadlineEvidence &&
      actionEvidence.segmentIndex === deadlineEvidence.segmentIndex &&
      actionEvidence.text === deadlineEvidence.text,
  );
  // A round deadline can quote the same sentence as the request; its own
  // source control below the ticket already covers that wording.
  const actionCovered = Boolean(
    actionEvidence &&
      (sameSentence ||
        rounds?.some(
          (round) =>
            round.evidence.segmentIndex === actionEvidence.segmentIndex &&
            round.evidence.text === actionEvidence.text,
        )),
  );

  const reveal = (key: EvidenceKey) => onReveal(revealed === key ? null : key);

  return (
    <aside className="rb-redline__answer" data-confirmed={!!confirmed || !!rounds} aria-labelledby="verdict-title">
      <h2 className="rb-redline__label" id="verdict-title" tabIndex={-1}>
        What it asks
      </h2>
      <p className="rb-redline__action">
        {direct ? action.summary : 'No direct request found in the reviewed text'}
      </p>

      {direct && actionEvidence && !actionCovered && (
        <>
          <button
            type="button"
            className="rb-redline__trace"
            aria-expanded={revealed === 'action'}
            onClick={() => reveal('action')}
          >
            See source <span className="rb-redline__trace-note">— the request</span>
          </button>
          {revealed === 'action' && <Quote evidence={actionEvidence} srOnly={!showInlineQuote} />}
        </>
      )}

      {rounds ? (
        <>
          <div className="rb-redline__due" data-status="confirmed">
            <p className="rb-redline__label">Deadlines</p>
            <ul className="rb-redline__rounds">
              {rounds.map((round) => (
                <li key={round.key}>
                  <p className="rb-redline__round-label">{round.label}</p>
                  <p className="rb-redline__date">{formatIsoHuman(round.date)}</p>
                  {round.time && <p className="rb-clock">at {round.time}</p>}
                  {round.date < today && <p className="rb-redline__passed">This date has passed.</p>}
                </li>
              ))}
            </ul>
            {deadline.basis && <p className="rb-redline__basis">{deadline.basis}</p>}
          </div>

          {rounds.map((round, index) => {
            const key: EvidenceKey = `deadline-${index}`;
            return (
              <div className="rb-redline__trace-group" key={key}>
                <button
                  type="button"
                  className="rb-redline__trace rb-redline__trace--stack"
                  aria-expanded={revealed === key}
                  onClick={() => reveal(key)}
                >
                  See source{' '}
                  <span className="rb-redline__trace-note">— {round.label.toLowerCase()}</span>
                </button>
                {revealed === key && <Quote evidence={round.evidence} srOnly={!showInlineQuote} />}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div className="rb-redline__due" data-status={confirmed ? 'confirmed' : 'open'}>
            <p className="rb-redline__label">{confirmed ? 'Due' : 'Deadline'}</p>
            {confirmed ? (
              <>
                <p className="rb-redline__date">{formatIsoHuman(confirmed)}</p>
                {deadline.time && <p className="rb-clock">at {deadline.time}</p>}
              </>
            ) : (
              <p className="rb-redline__notdue">
                {deadline.status === 'none'
                  ? 'No deadline found'
                  : deadline.status === 'needs_receipt'
                    ? 'Receipt date needed'
                    : deadline.conflict
                      ? 'Conflicting dates'
                      : 'Not confirmed'}
              </p>
            )}
            {confirmed && deadline.basis && <p className="rb-redline__basis">{deadline.basis}</p>}
            {deadline.status === 'unconfirmed' && deadlineEvidence && (
              <Quote evidence={deadlineEvidence} srOnly={false} />
            )}
            {!confirmed && deadline.reason && <p className="rb-redline__due-note">{deadline.reason}</p>}
          </div>

          {sameSentence && actionEvidence && (
            <>
              <button
                type="button"
                className="rb-redline__trace rb-redline__trace--stack"
                aria-expanded={revealed === 'action'}
                onClick={() => reveal('action')}
              >
                See source
                <span className="visually-hidden">
                  {' '}
                  — the sentence that states the request and the date
                </span>
              </button>
              {revealed === 'action' && <Quote evidence={actionEvidence} srOnly={!showInlineQuote} />}
            </>
          )}

          {!sameSentence && deadlineEvidence && (
            <>
              <button
                type="button"
                className="rb-redline__trace rb-redline__trace--stack"
                aria-expanded={revealed === 'deadline'}
                onClick={() => reveal('deadline')}
              >
                See source <span className="rb-redline__trace-note">— the deadline</span>
              </button>
              {revealed === 'deadline' && <Quote evidence={deadlineEvidence} srOnly={!showInlineQuote} />}
            </>
          )}
        </>
      )}

      {alreadyPassed && (
        <p className="rb-redline__due-note rb-redline__due-note--strong">
          That date has passed. Check the notice or contact the sender before relying on it.
        </p>
      )}

      {receiptBased && (
        <div className="rb-redline__receipt">
          <label className="rb-redline__label" htmlFor="receipt-date">
            Date you received it
          </label>
          <input
            id="receipt-date"
            className="rb-redline__field"
            type="date"
            value={receiptDate}
            onChange={(event) => onReceiptDateChange(event.target.value)}
            aria-describedby="receipt-help"
          />
          <p className="rb-redline__muted" id="receipt-help">
            Used only for this calculation. It is not stored.
          </p>
        </div>
      )}

      {deadline.calculation && deadline.calculation.length > 0 && (
        <ol className="rb-redline__calc" aria-label="How the date was counted">
          {deadline.calculation.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
