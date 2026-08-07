import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type TenantView } from '../lib/api';

export function ShowroomsPage() {
  const [tenants, setTenants] = useState<TenantView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTenants().then(setTenants).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Showrooms</h1>
          <p className="subtitle">
            Each showroom has its own inventory connection, its own widget key, and its own
            assistant.
          </p>
        </div>
        <Link to="/app/showrooms/new" className="btn btn-ink">
          Connect showroom
        </Link>
      </div>

      {error && <p className="status err">{error}</p>}

      <div className="panel">
        {tenants?.length === 0 && (
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
          {tenants?.map((tenant) => (
            <li key={tenant.id} className="tenant-row">
              <div>
                <div className="tenant-name">{tenant.name}</div>
                <div className="tenant-url">{tenant.erp_base_url}</div>
              </div>
              <div className="tenant-right">
                <Link to={`/app/showrooms/${tenant.id}/conversations`} className="link-btn">
                  Conversations
                </Link>
                <Link to={`/app/showrooms/${tenant.id}`} className="link-btn">
                  Settings
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
