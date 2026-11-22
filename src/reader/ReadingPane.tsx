import { useEffect, useRef } from 'react';
import { findQuoteRange } from '../lib/notice/highlight';

interface Props {
  text: string;
  sourceLabel: string;
  activeQuote: string | null;
  autoScroll: boolean;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function ReadingPane({ text, sourceLabel, activeQuote, autoScroll }: Props) {
  const markRef = useRef<HTMLElement | null>(null);
  const range = activeQuote ? findQuoteRange(text, activeQuote) : null;

  useEffect(() => {
    if (!activeQuote || !range || !autoScroll) return;
    const mark = markRef.current;
    if (!mark) return;
    mark.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [activeQuote, range, autoScroll]);

  const before = range ? text.slice(0, range.start) : '';
  const quoted = range ? text.slice(range.start, range.end) : '';
  const after = range ? text.slice(range.end) : '';

  return (
    <section className="rb-redline__source" aria-labelledby="pane-title">
      <div className="rb-redline__source-head">
        <div>
          <h2 id="pane-title">Reviewed text</h2>
          <p className="rb-redline__muted">
            {sourceLabel} · {text.trim().length} characters
          </p>
        </div>
      </div>

      <div
        className="rb-redline__reviewed-body"
        tabIndex={0}
        role="region"
        aria-label="Reviewed notice text"
      >
        {range ? (
          <p className="rb-redline__reviewed">
            {before}
            <mark
              className="rb-redline__match"
              ref={markRef}
              key={`${range.start}-${range.end}-${activeQuote}`}
            >
              {quoted}
            </mark>
            {after}
          </p>
        ) : (
          <p className="rb-redline__reviewed">{text}</p>
        )}
      </div>
    </section>
  );
}
