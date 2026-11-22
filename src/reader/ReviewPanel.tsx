interface Props {
  text: string;
  fileName: string;
  source: 'pdf' | 'ocr';
  warnings: string[];
  originalUrl: string | null;
  onChange: (text: string) => void;
  onRead: () => void;
  error?: string | null;
}

export default function ReviewPanel({
  text,
  fileName,
  source,
  warnings,
  originalUrl,
  onChange,
  onRead,
  error,
}: Props) {
  return (
    <section className="rb-redline__source rb-redline__review" aria-labelledby="review-title">
      <div className="rb-redline__source-head">
        <div>
          <h2 id="review-title">Review what was read</h2>
          <p className="rb-redline__muted">
            Correct anything that came through wrong. The answer and its quote come only from this text.
          </p>
        </div>
      </div>

      {warnings.map((warning) => (
        <p className="rb-redline__alert" role="alert" key={warning}>
          {warning}
        </p>
      ))}

      <div className={originalUrl ? 'rb-redline__compare' : undefined}>
        <div>
          <label className="rb-redline__label" htmlFor="review-text">
            Text read from the notice
          </label>
          <textarea
            id="review-text"
            className="rb-redline__text rb-redline__text--editor"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby="review-help"
            spellCheck={false}
          />
        </div>

        {originalUrl && (
          <>
            <figure className="rb-redline__compare-original">
              <figcaption className="rb-redline__label">Original image</figcaption>
              <img className="rb-redline__original" src={originalUrl} alt={`Original image: ${fileName}`} />
              <p className="rb-redline__muted">
                The text was read from this image. Words are not mapped to exact positions on it.
              </p>
            </figure>

            <details className="rb-redline__compare-disclosure">
              <summary>View original</summary>
              <img className="rb-redline__original" src={originalUrl} alt={`Original image: ${fileName}`} />
              <p className="rb-redline__muted">
                The text above was read from this image. Words are not mapped to exact positions on it.
              </p>
            </details>
          </>
        )}
      </div>

      {error && (
        <p className="rb-redline__alert" role="alert">
          {error}
        </p>
      )}

      <div className="rb-redline__row">
        <p className="rb-redline__muted" id="review-help">
          {text.trim().length} characters.{' '}
          {source === 'ocr'
            ? 'OCR reads the page as one stream, so a multi-column page can come out interleaved. Check names, amounts, dates, and order.'
            : 'Check names, amounts, and dates before reading.'}
        </p>
        <button
          type="button"
          className="rb-redline__button rb-redline__button--primary"
          onClick={onRead}
          disabled={!text.trim()}
        >
          Read this text
        </button>
      </div>
    </section>
  );
}
