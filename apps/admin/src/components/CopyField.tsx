import { useState } from 'react';

interface CopyFieldProps {
  label: string;
  value: string;
  help?: string;
}

/**
 * A read-only credential with a copy button. These values get pasted into
 * someone else's codebase, so selecting them by hand is the wrong ask.
 */
export function CopyField({ label, value, help }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked outside a secure context; the value is selectable.
    }
  }

  return (
    <div className="cred">
      <div className="cred-label">{label}</div>
      <div className="cred-value">
        <code>{value}</code>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}
