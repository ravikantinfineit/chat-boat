import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Overview } from '../lib/api';
import { useAuth } from '../lib/auth-context';

export function OverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.overview().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="subtitle">
            {user?.organisationName ?? 'Your organisation'} — activity across every showroom you
            run.
          </p>
        </div>
        <Link to="/app/showrooms/new" className="btn btn-ghost">
          Connect showroom
        </Link>
      </div>

      {error && <p className="status err">{error}</p>}

      <div className="stat-row">
        <Stat label="Showrooms" value={data?.showrooms} />
        <Stat label="Conversations" value={data?.conversations} />
        <Stat label="Messages" value={data?.messages} />
        <Stat label="Active holds" value={data?.activeHolds} hint="Stones reserved right now" />
      </div>

      <div className="panel">
        <h2>Showrooms</h2>
        <p className="hint">Each one reads stock live from its own inventory system.</p>

        {data?.perShowroom.length === 0 && (
          <div className="empty">
            <div className="empty-mark" aria-hidden="true">
              ◆
            </div>
            <div className="empty-title">No showrooms yet</div>
            <p className="empty-body">
              Connect your inventory system and the assistant can start answering customers about
              live stock.
            </p>
            <Link to="/app/showrooms/new">
              <button className="primary">Connect your first showroom</button>
            </Link>
          </div>
        )}

        <ul className="tenant-list">
          {data?.perShowroom.map((showroom) => (
            <li key={showroom.id} className="tenant-row">
              <div>
                <div className="tenant-name">{showroom.name}</div>
                <div className="tenant-url">{showroom.erp_base_url}</div>
              </div>
              <div className="tenant-right">
                <span className="muted">{showroom.conversations} conversations</span>
                <Link to={`/app/showrooms/${showroom.id}`} className="link-btn">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      {/* An em dash while loading, so the number does not jump from 0 to its real value. */}
      <div className="stat-value">{value === undefined ? '—' : value.toLocaleString()}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
