import { useEffect, useState } from 'react';
import { api, type AuditRow } from '../lib/api';

/** Plain-English names, so the log reads as a record rather than as event codes. */
const ACTIONS: Record<string, string> = {
  'credentials.reveal': 'Revealed webhook secret',
  'tenant.create': 'Connected a showroom',
  'tenant.update': 'Changed showroom settings',
  'agent-rules.update': 'Changed agent rules',
  'transcript.view': 'Read a full transcript',
  'customer.search': 'Searched for a customer',
  'customer.erase': 'Erased a customer',
  'retention.update': 'Changed retention settings',
  'retention.sweep': 'Automatic deletion ran',
};

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auditLog().then(setRows).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>Activity log</h1>
          <p className="subtitle">
            Who read or changed what. Reading a customer transcript is recorded here, which is what
            makes staff access to conversations accountable rather than merely convenient.
          </p>
        </div>
      </div>

      {error && <p className="status err">{error}</p>}

      <div className="panel">
        {rows?.length === 0 && <p className="muted">Nothing recorded yet.</p>}

        {rows && rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Detail</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.actorEmail}</td>
                    <td>{ACTIONS[row.action] ?? row.action}</td>
                    <td className="muted">{describe(row)}</td>
                    <td className="mono">{row.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function describe(row: AuditRow): string {
  if (row.metadata && Object.keys(row.metadata).length > 0) {
    return Object.entries(row.metadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
  // Ids are long and mean nothing at a glance; enough to correlate, not to fill the column.
  return row.target ? row.target.slice(0, 8) : '';
}
