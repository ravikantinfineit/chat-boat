import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ListEditor } from '../components/ListEditor';
import { api, type AgentRules } from '../lib/api';

/**
 * What the assistant is, and what it is allowed to do.
 *
 * The token estimate is shown throughout rather than hidden in a tooltip: this
 * text is sent on every model call and re-sent on every tool step, so a long
 * persona is a recurring cost, not a one-off.
 */
export function AgentRulesPage() {
  const { id } = useParams<{ id: string }>();
  const [rules, setRules] = useState<AgentRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.agentRules(id).then(setRules).catch((e: Error) => setError(e.message));
  }, [id]);

  function patch(change: Partial<AgentRules>) {
    setRules((prev) => (prev ? { ...prev, ...change } : prev));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!id || !rules) return;
    setSaving(true);
    setError(null);
    try {
      setRules(
        await api.updateAgentRules(id, {
          agent_persona: rules.agent_persona,
          agent_tone: rules.agent_tone,
          guardrails: rules.guardrails,
          escalation_rules: rules.escalation_rules,
          escalation_contact: rules.escalation_contact,
          allow_holds: rules.allow_holds,
          allow_quotes: rules.allow_quotes,
          allow_orders: rules.allow_orders,
          max_hold_hours: rules.max_hold_hours,
        }),
      );
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!rules) {
    return (
      <main className="page">
        <h1>Agent rules</h1>
        {error ? <p className="status err">{error}</p> : <p className="muted">Loading…</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Agent rules</h1>
          <p className="subtitle">
            How your assistant speaks, what it must never say, and what it is allowed to do on your
            behalf.
          </p>
        </div>
        <span className="pill neutral" title="Roughly what this configuration adds to every reply">
          ~{rules.estimated_prompt_tokens} tokens per reply
        </span>
      </div>

      <form onSubmit={save}>
        <div className="panel">
          <h2>Persona</h2>
          <p className="hint">
            Who the assistant is. Written in second person, as an instruction — "You are warm and
            unhurried, and you never rush a customer towards a bigger stone."
          </p>

          <div className="field">
            <label htmlFor="persona">Character</label>
            <textarea
              id="persona"
              maxLength={1500}
              value={rules.agent_persona ?? ''}
              onChange={(e) => patch({ agent_persona: e.target.value })}
              placeholder="You are a calm, knowledgeable consultant who explains grading in plain language."
            />
            <p className="help">{(rules.agent_persona ?? '').length} / 1500 characters</p>
          </div>

          <div className="field">
            <label htmlFor="tone">Tone</label>
            <input
              id="tone"
              maxLength={200}
              value={rules.agent_tone ?? ''}
              onChange={(e) => patch({ agent_tone: e.target.value })}
              placeholder="warm but professional; never salesy"
            />
          </div>
        </div>

        <div className="panel">
          <h2>Guardrails</h2>
          <p className="hint">
            Things the assistant must never do. Each one is sent to the model as an absolute rule —
            keep them short and specific, because vague rules are followed vaguely.
          </p>
          <ListEditor
            items={rules.guardrails}
            onChange={(guardrails) => patch({ guardrails })}
            max={15}
            placeholder="Never quote a price that is not from our system."
            addLabel="Add guardrail"
          />
        </div>

        <div className="panel">
          <h2>What it may do</h2>
          <p className="hint">
            Enforced on the server, not merely requested of the model — a switched-off capability is
            refused even if the assistant tries to use it.
          </p>

          <Toggle
            label="Reserve diamonds"
            help="Puts a stone on hold in your system for a real customer."
            checked={rules.allow_holds}
            onChange={(allow_holds) => patch({ allow_holds })}
          />
          <Toggle
            label="Issue quotations"
            help="Generates a quotation through your system, with your pricing and terms."
            checked={rules.allow_quotes}
            onChange={(allow_quotes) => patch({ allow_quotes })}
          />
          <Toggle
            label="Place orders"
            help="Takes a full order including delivery address. Off unless you are sure."
            checked={rules.allow_orders}
            onChange={(allow_orders) => patch({ allow_orders })}
          />

          <div className="field" style={{ maxWidth: 260, marginTop: 20 }}>
            <label htmlFor="maxHold">Longest hold allowed</label>
            <input
              id="maxHold"
              type="number"
              min={1}
              max={720}
              value={rules.max_hold_hours}
              onChange={(e) => patch({ max_hold_hours: Number(e.target.value) })}
            />
            <p className="help">
              Hours. A customer asking for longer gets this instead of being refused.
            </p>
          </div>
        </div>

        <div className="panel">
          <h2>Handing over to a person</h2>
          <p className="hint">
            When the assistant should stop and pass the customer to your team rather than keep
            answering.
          </p>
          <ListEditor
            items={rules.escalation_rules}
            onChange={(escalation_rules) => patch({ escalation_rules })}
            max={10}
            placeholder="The customer asks about finance or payment plans."
            addLabel="Add handover rule"
          />

          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor="contact">Who to hand over to</label>
            <input
              id="contact"
              maxLength={300}
              value={rules.escalation_contact ?? ''}
              onChange={(e) => patch({ escalation_contact: e.target.value })}
              placeholder="sales@yourshowroom.com or +91 98765 43210"
            />
            <p className="help">Given to the customer when the assistant hands over.</p>
          </div>
        </div>

        {error && <p className="status err">{error}</p>}

        <div className="actions">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save rules'}
          </button>
          {saved && (
            <span className="pill ok">
              <span className="dot" aria-hidden="true" />
              Live on your next conversation
            </span>
          )}
        </div>
      </form>
    </main>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
        <em>{help}</em>
      </span>
    </label>
  );
}
