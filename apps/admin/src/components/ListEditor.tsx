/** Edits a short list of one-line rules. */
export function ListEditor({
  items,
  onChange,
  max,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  max: number;
  placeholder: string;
  addLabel: string;
}) {
  const replace = (index: number, value: string) =>
    onChange(items.map((item, i) => (i === index ? value : item)));

  return (
    <div className="list-editor">
      {items.map((item, index) => (
        // Index as key: these rows have no id, and the list is re-rendered from
        // the array on every keystroke anyway.
        <div className="list-row" key={index}>
          <input
            value={item}
            maxLength={200}
            placeholder={placeholder}
            onChange={(e) => replace(index, e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}

      {items.length === 0 && <p className="muted">None set.</p>}

      <button
        type="button"
        onClick={() => onChange([...items, ''])}
        disabled={items.length >= max}
        style={{ marginTop: 10 }}
      >
        {items.length >= max ? `Limit of ${max} reached` : addLabel}
      </button>
    </div>
  );
}
