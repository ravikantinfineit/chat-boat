import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ConversationRow, type HoldRow } from '../lib/api';

/** Conversations and holds share a shape, so one page renders either. */
export function ConversationsPage({ mode }: { mode: 'conversations' | 'holds' }) {
  const { id } = useParams<{ id: string }>();
  const [rows, setRows] = useState<(ConversationRow | HoldRow)[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = mode === 'conversations' ? api.conversations(id) : api.holds(id);
    load.then(setRows).catch((e: Error) => setError(e.message));
  }, [id, mode]);

  const isConversations = mode === 'conversations';

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{isConversations ? 'Conversations' : 'Holds'}</h1>
          <p className="subtitle">
            {isConversations
              ? 'Every chat this showroom has had, most recent first.'
              : 'Stones currently reserved for a customer, and when each reservation lapses.'}
          </p>
        </div>
      </div>

      {error && <p className="status err">{error}</p>}

      <div className="panel">
        {rows?.length === 0 && (
          <p className="muted">
            {isConversations ? 'No conversations yet.' : 'Nothing is on hold right now.'}
          </p>
        )}

        {rows && rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                {isConversations ? (
                  <tr>
                    <th>Started</th>
                    <th>Channel</th>
                    <th>Customer</th>
                    <th>Messages</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Reference</th>
                    <th>Diamond</th>
                    <th>Customer</th>
                    <th>Expires</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((row) =>
                  isConversations ? (
                    <ConversationRowView key={row.id} row={row as ConversationRow} tenantId={id!} />
                  ) : (
                    <HoldRowView key={row.id} row={row as HoldRow} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function ConversationRowView({ row, tenantId }: { row: ConversationRow; tenantId: string }) {
  return (
    <tr>
      <td>
        <Link to={`/app/showrooms/${tenantId}/conversations/${row.id}`}>
          {new Date(row.createdAt).toLocaleString()}
        </Link>
      </td>
      <td>{row.channel}</td>
      <td>{row.customerName ?? <span className="muted">anonymous</span>}</td>
      <td className="num">{row._count?.messages ?? 0}</td>
    </tr>
  );
}

function HoldRowView({ row }: { row: HoldRow }) {
  return (
    <tr>
      <td className="mono">{row.erpHoldId}</td>
      <td className="mono">{row.diamondId}</td>
      <td>{row.customerName}</td>
      <td>{new Date(row.expiresAt).toLocaleString()}</td>
    </tr>
  );
}
