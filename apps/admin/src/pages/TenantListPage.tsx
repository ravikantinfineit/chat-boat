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

  const isEmpty = !loading && !error && tenants.length === 0;

  return (
    <main className="layout">
      <div className="page-head">
        <div>
          <h1>Showrooms</h1>
          <p className="subtitle">
            Each showroom connects the assistant to its own inventory system. Stock and prices are
            read live — nothing is copied or stored here.
          </p>
        </div>
        {!isEmpty && (
          <Link to="/tenants/new" className="link-btn">
            Connect showroom
          </Link>
        )}
      </div>

      <div className="panel">
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="status err">{error}</p>}

        {isEmpty && (
          <div className="empty">
            <div className="empty-mark" aria-hidden="true">
              ◆
            </div>
            <div className="empty-title">No showrooms yet</div>
            <p className="empty-body">
              Connect your inventory system and the assistant can start answering customers about
              live stock.
            </p>
            <Link to="/tenants/new">
              <button className="primary">Connect your first showroom</button>
            </Link>
          </div>
        )}

        {tenants.length > 0 && (
          <ul className="tenant-list">
            {tenants.map((tenant) => (
              <li key={tenant.id} className="tenant-row">
                <div>
                  <div className="tenant-name">{tenant.name}</div>
                  <div className="tenant-url">{tenant.erp_base_url}</div>
                </div>
                <Link to={`/tenants/${tenant.id}`} className="link-btn">
                  Settings
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
