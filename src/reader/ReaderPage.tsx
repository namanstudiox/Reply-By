import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeNotice, type Evidence, type NoticeAnalysis, type TextSource } from '../lib/notice/analyze';
import { detectKind, extractFile, ExtractError, LIMITS } from '../lib/notice/extract';
import { findQuoteRange } from '../lib/notice/highlight';
import { normalizeNoticeText } from '../lib/notice/text';
import PastePanel from './PastePanel';
import ReadingPane from './ReadingPane';
import ResultCard, { type EvidenceKey } from './ResultCard';
import ReviewPanel from './ReviewPanel';
import UploadPanel from './UploadPanel';

type InputMode = 'file' | 'paste';

interface Draft {
  kind: InputMode;
  fileName: string;
  source: TextSource;
  pages: number;
  warnings: string[];
  text: string;
}

interface Analyzed {
  result: NoticeAnalysis;
  text: string;
  source: TextSource;
  kind: InputMode;
  fileName: string;
  pages: number;
}

interface ExtractionState {
  status: 'idle' | 'working' | 'error';
  message?: string;
  ratio?: number;
  error?: string;
  hint?: string;
  fileName?: string;
}

const ACCEPT = '.pdf,application/pdf,image/png,image/jpeg,.png,.jpg,.jpeg';
const WIDE_QUERY = '(min-width: 53.001rem)';
const FILE_MB = LIMITS.fileBytes / (1024 * 1024);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function evidenceFor(key: EvidenceKey | null, result: NoticeAnalysis | undefined): Evidence | null {
  if (!key || !result) return null;
  if (key === 'action') return result.action.evidence;
  if (key === 'deadline') return result.deadline.evidence;
  const index = Number(key.slice('deadline-'.length));
  return result.deadline.deadlines?.[index]?.evidence ?? null;
}

function useWideLayout(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return wide;
}

export default function ReaderPage() {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [pasteText, setPasteText] = useState('');
  const [review, setReview] = useState<Draft | null>(null);
  const [analysis, setAnalysis] = useState<Analyzed | null>(null);
  const [extraction, setExtraction] = useState<ExtractionState>({ status: 'idle' });
  const [receiptDate, setReceiptDate] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<EvidenceKey | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const jobRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const originalUrlRef = useRef<string | null>(null);
  const wide = useWideLayout();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, []);

  const setOriginal = useCallback((file: File | null) => {
    if (originalUrlRef.current) {
      URL.revokeObjectURL(originalUrlRef.current);
      originalUrlRef.current = null;
    }
    if (file && detectKind(file) === 'image') {
      const url = URL.createObjectURL(file);
      originalUrlRef.current = url;
      setOriginalUrl(url);
      return;
    }
    setOriginalUrl(null);
  }, []);

  const openPicker = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const scrollToResult = useCallback(() => {

    requestAnimationFrame(() => {
      resultRef.current?.querySelector<HTMLElement>('#verdict-title')?.focus({ preventScroll:true });
      resultRef.current?.scrollIntoView({
        block: 'start',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      jobRef.current += 1;
      const job = jobRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setInputMode('file');
      setReview(null);
      setAnalysis(null);
      setRevealed(null);
      setInputError(null);
      setReceiptDate('');
      setPasteText('');
      setOriginal(null);
      setExtraction({ status: 'working', message: 'Reading the file…', fileName: file.name });

      try {
        const result = await extractFile(file, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (jobRef.current !== job) return;
            setExtraction({
              status: 'working',
              message: progress.message,
              ratio: progress.ratio,
              fileName: file.name,
            });
          },
        });
        if (jobRef.current !== job) return;
        setReview({
          kind: 'file',
          fileName: result.fileName,
          source: result.source,
          pages: result.pages,
          warnings: result.warnings,
          text: result.text,
        });
        setOriginal(result.source === 'ocr' ? file : null);
        setExtraction({ status: 'idle' });
      } catch (error) {
        if (jobRef.current !== job) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setOriginal(null);
        if (error instanceof ExtractError) {
          setExtraction({
            status: 'error',
            error: error.message,
            hint: error.hint,
            fileName: file.name,
          });
        } else {
          setExtraction({
            status: 'error',
            error: "This file couldn't be read in the browser.",
            hint: 'Try again, use another copy, or paste the text instead.',
            fileName: file.name,
          });
        }
      } finally {
        if (jobRef.current === job) abortRef.current = null;
      }
    },
    [setOriginal],
  );

  const cancelExtraction = useCallback(() => {
    jobRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setExtraction({ status: 'idle' });
    setReview(null);
    setOriginal(null);
  }, [setOriginal]);

  const runAnalysis = useCallback(
    (draft: Draft, receipt: string) => {
      const clean = normalizeNoticeText(draft.text);
      if (!clean) {
        setInputError('There is no text to read yet. Add the notice text first.');
        setAnalysis(null);
        return;
      }
      const result = analyzeNotice(clean, {
        source: draft.source,
        receiptDate: receipt || null,
      });
      setInputError(null);
      setRevealed(null);
      setAnalysis({
        result,
        text: clean,
        source: draft.source,
        kind: draft.kind,
        fileName: draft.fileName,
        pages: draft.pages,
      });
      scrollToResult();
    },
    [scrollToResult],
  );

  const handleAnalyzePaste = useCallback(() => {
    const clean = normalizeNoticeText(pasteText);
    if (!clean) {
      setInputError('Paste the notice text first.');
      return;
    }
    setOriginal(null);
    runAnalysis(
      {
        kind: 'paste',
        fileName: 'Pasted text',
        source: 'typed',
        pages: 0,
        warnings: [],
        text: pasteText,
      },
      receiptDate,
    );
  }, [pasteText, receiptDate, runAnalysis, setOriginal]);

  const handleAnalyzeReview = useCallback(() => {
    if (!review) return;
    runAnalysis(review, receiptDate);
  }, [review, receiptDate, runAnalysis]);

  const handleReceiptChange = useCallback(
    (value: string) => {
      setReceiptDate(value);
      if (!analysis) return;
      const result = analyzeNotice(analysis.text, {
        source: analysis.source,
        receiptDate: value || null,
      });
      setAnalysis({ ...analysis, result });
    },
    [analysis],
  );

  const handleReviewedTextChange = useCallback(
    (text: string) => {
      setReview((current) => (current ? { ...current, text } : current));
      if (review?.kind === 'paste') setPasteText(text);
      setAnalysis(null);
      setRevealed(null);
      setInputError(null);
    },
    [review?.kind],
  );

  const handlePasteChange = useCallback((text: string) => {
    setPasteText(text);
    setAnalysis(null);
    setRevealed(null);
    setReceiptDate('');
    setInputError(null);
  }, []);

  const editText = useCallback(() => {
    if (!analysis) return;
    setReview({
      kind: analysis.kind,
      fileName: analysis.fileName,
      source: analysis.source,
      pages: analysis.pages,
      warnings: [],
      text: analysis.text,
    });
    setAnalysis(null);
    setRevealed(null);
    setInputError(null);
  }, [analysis]);

  const changeSource = useCallback(() => {
    if (!review) return;
    if (review.kind === 'file') {
      openPicker();
      return;
    }
    setReview(null);
    setAnalysis(null);
    setRevealed(null);
    setInputMode('paste');
    setReceiptDate('');
    setPasteText('');
  }, [review, openPicker]);

  const resetAll = useCallback(() => {
    jobRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPasteText('');
    setReview(null);
    setAnalysis(null);
    setExtraction({ status: 'idle' });
    setReceiptDate('');
    setInputError(null);
    setRevealed(null);
    setInputMode('file');
    setOriginal(null);
    setFileInputKey((key) => key + 1);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [setOriginal]);

  const view: 'input' | 'review' | 'result' = analysis ? 'result' : review ? 'review' : 'input';
  const busy = extraction.status === 'working';
  const pasteOpen = inputMode === 'paste';
  const activeEvidence = evidenceFor(revealed, analysis?.result);
  const evidenceLocatable = activeEvidence
    ? Boolean(analysis && findQuoteRange(analysis.text, activeEvidence.text))
    : false;
  const showInlineQuote = !wide || !evidenceLocatable;
  const docName = analysis?.fileName ?? review?.fileName ?? '';
  const docMeta = analysis
    ? [
        analysis.source === 'pdf'
          ? 'PDF text layer'
          : analysis.source === 'ocr'
            ? 'Read by OCR'
            : 'Pasted into this page',
        analysis.pages > 1 ? `${analysis.pages} pages` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : review
      ? [
          review.source === 'pdf'
            ? 'PDF text layer'
            : review.source === 'ocr'
              ? 'Read by OCR'
              : 'Pasted into this page',
          review.pages > 1 ? `${review.pages} pages` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <div className="rb-redline">
      <input
        key={fileInputKey}
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />

      <header className="rb-redline__mast">
        <div className="rb-redline__wide">
          <a className="rb-redline__logo-link" href="/app">
            <img
              className="rb-redline__logo"
              src="/reply-by-logo-inverse.svg"
              alt="Reply-By"
              width={570}
              height={152}
            />
          </a>
          <span className="rb-redline__kicker">Private reader</span>
        </div>
      </header>

      <main className="rb-redline__wide rb-redline__main" aria-labelledby="reader-title">
        <div className="rb-stage"><span>Notice reader</span><span>{view === 'result' ? '03 / Result' : view === 'review' || pasteOpen ? '02 / Review' : '01 / Input'}</span></div>
        {view === 'input' && (
          <section className="rb-redline__entry" aria-labelledby="reader-title">
            <div className="rb-redline__lead">

              <h1 className="rb-redline__headline" id="reader-title">
                Find the <br />line.<span className="rb-redline__cut" aria-hidden="true" />
              </h1>
              <p>What to do, when it’s due, and where it says so.</p>
            </div>

            <div
              className="rb-redline__well"
              data-drag={dragging ? 'true' : undefined}
              aria-busy={busy || undefined}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
            >
              <h2>{pasteOpen ? 'Paste your notice' : 'Add your notice'}</h2>

              <div className="rb-redline__modes">
                <button type="button" className="rb-redline__button" onClick={openPicker} disabled={busy}>
                  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 3h9l5 5v13H5z M14 3v6h5" /></svg>Choose a file
                </button>
                <button
                  type="button"
                  className="rb-redline__button"
                  aria-expanded={pasteOpen}
                  aria-controls="paste-editor"
                  onClick={() => {
                    setInputMode(pasteOpen ? 'file' : 'paste');
                    setExtraction({status:'idle'});
                    setInputError(null);
                  }}
                  disabled={busy}
                >
                  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16v4 M4 8V4 M12 4v16 M8 20h8" /></svg>Paste text
                </button>
              </div>

              <p className="rb-redline__muted">
                Drop a PDF, PNG or JPG here. Up to {FILE_MB} MB per file and {LIMITS.pdfPages} pages per PDF.
              </p>

              {pasteOpen && (
                <div id="paste-editor">
                  <PastePanel
                    value={pasteText}
                    onChange={handlePasteChange}
                    onRead={handleAnalyzePaste}
                    disabled={!pasteText.trim()}
                  />
                  {inputError && (
                    <p className="rb-redline__alert" role="alert">
                      {inputError}
                    </p>
                  )}
                </div>
              )}

              <UploadPanel
                status={extraction.status}
                message={extraction.message}
                ratio={extraction.ratio}
                error={extraction.error}
                hint={extraction.hint}
                fileName={extraction.fileName}
                onChoose={openPicker}
                onCancel={cancelExtraction}
              />
            </div>
          </section>
        )}

        {view === 'review' && review && (
          <>
            <h1 className="visually-hidden" id="reader-title">
              Notice under review: {docName}
            </h1>
            <div className="rb-redline__filebar">
              <div>
                <p className="rb-redline__name">{docName}</p>
                <p className="rb-redline__muted">{docMeta}</p>
              </div>
              <div className="rb-redline__filebar-actions">
                <button type="button" className="rb-redline__button" onClick={changeSource}>
                  {review.kind === 'file' ? 'Change file' : 'Paste different text'}
                </button>
                <button type="button" className="rb-redline__linkbtn" onClick={resetAll}>
                  Start over
                </button>
              </div>
            </div>

            <ReviewPanel
              text={review.text}
              fileName={review.fileName}
              source={review.source === 'ocr' ? 'ocr' : 'pdf'}
              warnings={review.warnings}
              originalUrl={originalUrl}
              onChange={handleReviewedTextChange}
              onRead={handleAnalyzeReview}
              error={inputError}
            />
          </>
        )}

        {view === 'result' && analysis && (
          <>
            <h1 className="visually-hidden" id="reader-title">
              Notice: {docName}
            </h1>
            <div className="rb-redline__filebar">
              <div>
                <p className="rb-redline__name">{docName}</p>
                <p className="rb-redline__muted">{docMeta}</p>
              </div>
              <div className="rb-redline__filebar-actions">
                <button type="button" className="rb-redline__button" onClick={editText}>
                  Edit text
                </button>
                <button type="button" className="rb-redline__linkbtn" onClick={resetAll}>
                  Start over
                </button>
              </div>
            </div>

            <div className="rb-redline__desk" data-stage="result" ref={resultRef}>
              <ResultCard
                analysis={analysis.result}
                receiptDate={receiptDate}
                onReceiptDateChange={handleReceiptChange}
                revealed={revealed}
                onReveal={setRevealed}
                showInlineQuote={showInlineQuote}
              />
              <ReadingPane
                text={analysis.text}
                sourceLabel={analysis.result.sourceLabel}
                activeQuote={revealed ? (activeEvidence?.text ?? null) : null}
                autoScroll={wide}
              />
            </div>
          </>
        )}

        <footer className="rb-redline__footer">
          <p>
            Your notice stays in this browser. Nothing is uploaded or saved.
          </p>
          <p>
            Reads the wording only. No legal advice or automatic replies.
          </p>
        </footer>
      </main>
    </div>
  );
}
