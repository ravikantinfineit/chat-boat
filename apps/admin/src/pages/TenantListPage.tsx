import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type TenantView } from '../lib/api';

export function TenantListPage() {
  const [tenants, setTenants] = useState<TenantView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listTenants()
      .then(setTenants)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="layout">
      <h1>Showrooms</h1>
      <p className="subtitle">
        Each showroom connects the chatbot to its own inventory system.
      </p>

      <div className="panel">
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="status err">{error}</p>}
        {!loading && !error && tenants.length === 0 && (
          <p className="muted">No showrooms connected yet.</p>
        )}
        <ul className="tenant-list">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <div>
                <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                <div className="muted">{tenant.erp_base_url}</div>
              </div>
              <Link to={`/tenants/${tenant.id}`}>Settings</Link>
            </li>
          ))}
        </ul>
      </div>

      <Link to="/tenants/new">
        <button className="primary">Connect a showroom</button>
      </Link>
    </div>
  );
}
