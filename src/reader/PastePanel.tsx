interface Props {
  value: string;
  onChange: (value: string) => void;
  onRead: () => void;
  disabled: boolean;
}

export default function PastePanel({ value, onChange, onRead, disabled }: Props) {
  return (
    <div className="rb-redline__paste">
      <label className="rb-redline__label" htmlFor="paste-text">
        Notice text
      </label>
      <textarea
        id="paste-text"
        className="rb-redline__text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste the wording of the notice here."
        aria-describedby="paste-help"
        autoComplete="off"
        spellCheck={false}
        autoFocus
      />
      <div className="rb-redline__row">
        <p className="rb-redline__muted" id="paste-help">
          Check the wording before reading.
        </p>
        <button
          type="button"
          className="rb-redline__button rb-redline__button--primary"
          onClick={onRead}
          disabled={disabled}
        >
          Read this text
        </button>
      </div>
    </div>
  );
}
