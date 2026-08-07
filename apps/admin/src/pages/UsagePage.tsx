import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Usage } from '../lib/api';

const TOOL_LABELS: Record<string, string> = {
  search_diamonds: 'Searched stock',
  get_diamond_details: 'Opened a stone',
  check_availability: 'Checked availability',
  compare_diamonds: 'Compared stones',
  hold_diamond: 'Reserved a stone',
  release_hold: 'Released a reservation',
  create_quotation: 'Issued a quotation',
  place_order: 'Placed an order',
  get_order_status: 'Checked an order',
};

const RANGES = [7, 30, 90];

export function UsagePage() {
  const { id } = useParams<{ id: string }>();
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setUsage(null);
    api.usage(id, days).then(setUsage).catch((e: Error) => setError(e.message));
  }, [id, days]);

  const peak = Math.max(1, ...(usage?.daily.map((day) => day.messages) ?? [1]));

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Usage &amp; cost</h1>
          <p className="subtitle">
            What your assistant did, and what it cost to run. Costs are estimated from published
            rates — your invoice is authoritative.
          </p>
        </div>
        <div className="seg">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              className={range === days ? 'is-active' : ''}
              onClick={() => setDays(range)}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="status err">{error}</p>}

      <div className="stat-row">
        <Stat label="Conversations" value={usage?.conversations} />
        <Stat label="People" value={usage?.visitors} hint="Distinct browsers, counted anonymously" />
        <Stat label="Messages" value={usage?.messages} />
        <Stat
          label="Estimated cost"
          value={usage ? `$${usage.estimatedCostUsd.toFixed(2)}` : undefined}
          hint={`Over ${days} days`}
        />
      </div>

      <div className="panel">
        <h2>What customers did</h2>
        <p className="hint">
          Every row is a live call to your inventory system on a customer's behalf.
        </p>

        {usage?.funnel.length === 0 && <p className="muted">Nothing yet in this period.</p>}

        <ul className="funnel">
          {usage?.funnel.map((step) => (
            <li key={step.tool}>
              <div className="funnel-label">{TOOL_LABELS[step.tool] ?? step.tool}</div>
              <div className="funnel-bar">
                <span
                  style={{
                    width: `${(step.calls / Math.max(...usage.funnel.map((f) => f.calls))) * 100}%`,
                  }}
                />
              </div>
              <div className="funnel-count">
                {step.calls}
                {step.failures > 0 && <em title="Calls that failed"> · {step.failures} failed</em>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h2>Tokens</h2>
        <p className="hint">
          The assistant re-reads the conversation on every reply. Most of that is served from cache
          at a tenth of the price, which is where the bill stays small.
        </p>

        <div className="token-grid">
          <TokenStat label="New input" value={usage?.tokens.input} />
          <TokenStat label="Written to cache" value={usage?.tokens.cacheWrite} />
          <TokenStat label="Read from cache" value={usage?.tokens.cacheRead} accent />
          <TokenStat label="Generated" value={usage?.tokens.output} />
        </div>

        {usage && (
          <div className="cache-meter">
            <div className="cache-bar">
              <span style={{ width: `${Math.round(usage.cacheHitRate * 100)}%` }} />
            </div>
            <p className="help">
              <strong>{Math.round(usage.cacheHitRate * 100)}%</strong> of everything the model read
              came from cache. A sharp drop here means the shared prompt changed — worth telling us
              about.
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>By day</h2>
        {usage?.daily.length === 0 && <p className="muted">No activity in this period.</p>}
        <ul className="spark">
          {usage?.daily.map((day) => (
            <li key={day.date} title={`${day.date}: ${day.messages} messages, $${day.costUsd.toFixed(4)}`}>
              <span style={{ height: `${Math.max(3, (day.messages / peak) * 100)}%` }} />
              <em>{day.date.slice(5)}</em>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value?: number | string;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function TokenStat({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className={`token-stat${accent ? ' is-accent' : ''}`}>
      <div className="token-value">{value === undefined ? '—' : value.toLocaleString()}</div>
      <div className="token-label">{label}</div>
    </div>
  );
}
