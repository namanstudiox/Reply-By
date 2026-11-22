interface Props {
  status: 'idle' | 'working' | 'error';
  message?: string;
  ratio?: number;
  error?: string;
  hint?: string;
  fileName?: string;
  onChoose: () => void;
  onCancel: () => void;
}

export default function UploadPanel({
  status,
  message,
  ratio,
  error,
  hint,
  fileName,
  onChoose,
  onCancel,
}: Props) {
  if (status === 'idle') return null;

  const percent = typeof ratio === 'number' ? Math.round(Math.min(1, Math.max(0, ratio)) * 100) : null;

  if (status === 'error' && error) {
    return (
      <div className="rb-redline__status">
        <div className="rb-redline__alert" role="alert">
          <p className="rb-redline__working-file">{fileName ?? 'That file'}</p>
          <p>{error}</p>
          {hint && <p className="rb-redline__muted">{hint}</p>}
        </div>
        <p className="rb-redline__row">
          <button type="button" className="rb-redline__button" onClick={onChoose}>
            Choose another file
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="rb-redline__status" role="status" aria-live="polite">
      <p className="rb-redline__working-file">{fileName ?? 'Your file'}</p>
      <p className="rb-redline__muted">
        {message ?? 'Reading the file…'}
        {percent !== null ? ` · ${percent}%` : ''}
      </p>
      <div
        className={`rb-redline__track${percent === null ? ' rb-redline__track--waiting' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label={percent === null ? 'Reading the file' : `Reading the file, ${percent} percent`}
      >
        <span
          className={`rb-redline__bar${percent === null ? ' rb-redline__bar--waiting' : ''}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <button type="button" className="rb-redline__button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
