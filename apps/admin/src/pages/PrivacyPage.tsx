import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ListEditor } from '../components/ListEditor';
import { api, type CustomerRecord, type PrivacySettings } from '../lib/api';

const RETENTION_CHOICES = [
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
  { days: 730, label: '2 years' },
  { days: 2555, label: '7 years' },
];

export function PrivacyPage() {
  const { id } = useParams<{ id: string }>();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.privacy(id).then(setSettings).catch((e: Error) => setError(e.message));
  }, [id]);

  function patch(change: Partial<PrivacySettings>) {
    setSettings((prev) => (prev ? { ...prev, ...change } : prev));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!id || !settings) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await api.updatePrivacy(id, settings));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <main className="page">
        <h1>Privacy &amp; retention</h1>
        {error ? <p className="status err">{error}</p> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Privacy &amp; retention</h1>
          <p className="subtitle">
            How long customer conversations are kept, who may embed your assistant, and what it is
            allowed to spend.
          </p>
        </div>
      </div>

      <div className="panel panel-accent">
        <h2>What we hold about your customers</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          Names, phone numbers and email addresses are encrypted before they are stored — a stolen
          copy of the database yields nothing readable.
        </p>
        <p className="help">
          Message transcripts are <strong>not</strong> encrypted. They are replayed to the model on
          every reply, and encrypting them would add cost to every message. They contain whatever a
          customer typed, including details they volunteer mid-conversation. That risk is managed by
          the retention window below, by access control, and by the audit log — not eliminated.
        </p>
        <p className="help">
          Conversations are processed by Anthropic's Claude, which makes Anthropic a sub-processor
          you must disclose in your own privacy notice.
        </p>
      </div>

      <form onSubmit={save}>
        <div className="panel">
          <h2>How long conversations are kept</h2>
          <p className="hint">
            After this, conversations and their messages are deleted automatically each night. Holds
            are kept — an active reservation is a live commitment.
          </p>

          <div className="choice-row">
            {RETENTION_CHOICES.map((choice) => (
              <button
                key={choice.days}
                type="button"
                className={`choice${settings.retention_days === choice.days ? ' is-active' : ''}`}
                onClick={() => patch({ retention_days: choice.days })}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <p className="help">Currently {settings.retention_days} days.</p>
        </div>

        <div className="panel">
          <h2>Where your widget may be embedded</h2>
          <p className="hint">
            Your widget key is public — it is visible in your own page source. This list is what
            stops someone else putting your assistant on their site and spending your budget. Leave
            empty to allow any website.
          </p>
          <ListEditor
            items={settings.allowed_origins}
            onChange={(allowed_origins) => patch({ allowed_origins })}
            max={20}
            placeholder="https://www.yourshowroom.com"
            addLabel="Add website"
          />
        </div>

        <div className="panel">
          <h2>Spending limits</h2>
          <p className="hint">
            Ceilings, not budgets. When one is reached the assistant tells customers to contact you
            directly rather than going quiet.
          </p>

          <div className="row">
            <div className="field">
              <label htmlFor="dailyCap">Messages per day</label>
              <input
                id="dailyCap"
                type="number"
                min={1}
                value={settings.daily_message_cap ?? ''}
                placeholder="No limit"
                onChange={(e) =>
                  patch({ daily_message_cap: e.target.value ? Number(e.target.value) : null })
                }
              />
              <p className="help">Counts customer messages, not replies.</p>
            </div>
            <div className="field">
              <label htmlFor="tokenBudget">Tokens per month</label>
              <input
                id="tokenBudget"
                type="number"
                min={1000}
                step={1000}
                value={settings.monthly_token_budget ?? ''}
                placeholder="No limit"
                onChange={(e) =>
                  patch({ monthly_token_budget: e.target.value ? Number(e.target.value) : null })
                }
              />
              <p className="help">Compare against the figure on your usage page.</p>
            </div>
          </div>
        </div>

        {error && <p className="status err">{error}</p>}

        <div className="actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && (
            <span className="pill ok">
              <span className="dot" aria-hidden="true" />
              Saved
            </span>
          )}
        </div>
      </form>

      <ErasureTool tenantId={id!} />
    </main>
  );
}

/**
 * "Tell me what you have on me", and "delete it".
 *
 * Deliberately two steps with the found records shown in between: erasure cannot
 * be undone, and a mistyped digit should not silently delete nothing — or
 * silently delete someone else.
 */
function ErasureTool({ tenantId }: { tenantId: string }) {
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<'phone' | 'email'>('phone');
  const [found, setFound] = useState<CustomerRecord | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setFound(await api.customerLookup(tenantId, term, kind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    if (!confirm(`Permanently delete every conversation for this ${kind}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.eraseCustomer(tenantId, term, kind);
      setDone(
        `Deleted ${result.conversations} conversations and ${result.messages} messages, and anonymised ${result.holds} holds.`,
      );
      setFound(null);
      setTerm('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 28 }}>
      <h2>Customer data requests</h2>
      <p className="hint">
        Find everything held about one customer, and delete it if they ask. Searching and erasing
        are both recorded in your audit log.
      </p>

      <form onSubmit={search} className="lookup-row">
        <div className="seg">
          <button
            type="button"
            className={kind === 'phone' ? 'is-active' : ''}
            onClick={() => setKind('phone')}
          >
            Phone
          </button>
          <button
            type="button"
            className={kind === 'email' ? 'is-active' : ''}
            onClick={() => setKind('email')}
          >
            Email
          </button>
        </div>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={kind === 'phone' ? '+91 98765 43210' : 'customer@example.com'}
          required
          minLength={3}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Find'}
        </button>
      </form>

      {error && <p className="status err">{error}</p>}
      {done && (
        <p className="pill ok" style={{ marginTop: 14 }}>
          <span className="dot" aria-hidden="true" />
          {done}
        </p>
      )}

      {found && (
        <div className="lookup-result">
          {found.conversations.length === 0 && found.holds.length === 0 ? (
            <p className="muted">Nothing found for that {kind}.</p>
          ) : (
            <>
              <p>
                <strong>{found.conversations.length}</strong> conversations and{' '}
                <strong>{found.holds.length}</strong> holds.
              </p>
              <ul className="plain-list">
                {found.conversations.slice(0, 8).map((conversation) => (
                  <li key={conversation.id}>
                    {new Date(conversation.createdAt).toLocaleString()} — {conversation.messages}{' '}
                    messages
                    {conversation.customerName ? ` — ${conversation.customerName}` : ''}
                  </li>
                ))}
              </ul>
              <button type="button" className="danger" onClick={erase} disabled={busy}>
                Erase all of it
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
