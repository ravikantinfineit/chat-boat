import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Transcript } from '../lib/api';

/** One block of a stored message, in the model's wire format. */
interface Block {
  type: string;
  text?: string;
  name?: string;
  content?: string;
  is_error?: boolean;
}

export function TranscriptPage() {
  const { id, conversationId } = useParams<{ id: string; conversationId: string }>();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !conversationId) return;
    api.transcript(id, conversationId).then(setTranscript).catch((e: Error) => setError(e.message));
  }, [id, conversationId]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Conversation</h1>
          <p className="subtitle">
            {transcript
              ? new Date(transcript.createdAt).toLocaleString()
              : 'Loading the full transcript…'}
          </p>
        </div>
        <Link to={`/app/showrooms/${id}/conversations`} className="btn btn-ghost">
          Back
        </Link>
      </div>

      {error && <p className="status err">{error}</p>}

      {transcript && (
        <>
          <div className="panel">
            <h2>Customer</h2>
            <p className="hint">Decrypted for this view. Opening this page is recorded in your audit log.</p>
            <dl className="detail-list">
              <dt>Name</dt>
              <dd>{transcript.customerName ?? <span className="muted">not given</span>}</dd>
              <dt>Phone</dt>
              <dd>{transcript.customerPhone ?? <span className="muted">not given</span>}</dd>
              <dt>Email</dt>
              <dd>{transcript.customerEmail ?? <span className="muted">not given</span>}</dd>
            </dl>
          </div>

          <div className="panel">
            <h2>Transcript</h2>
            <div className="transcript">
              {transcript.messages.map((message) => (
                <Message key={message.id} role={message.role} content={message.content} />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Message({ role, content }: { role: 'user' | 'assistant'; content: unknown }) {
  const blocks: Block[] =
    typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : Array.isArray(content)
        ? (content as Block[])
        : [];

  // Tool traffic is rendered as a thin trace line rather than a bubble: a "user"
  // message carrying only tool results is the system talking to itself, and
  // showing it as a customer bubble would misrepresent who said what.
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'text' && block.text?.trim()) {
          return (
            <div key={index} className={`bubble bubble-${role}`}>
              {block.text}
            </div>
          );
        }
        if (block.type === 'tool_use') {
          return (
            <div key={index} className="trace">
              called <code>{block.name}</code>
            </div>
          );
        }
        if (block.type === 'tool_result') {
          return (
            <div key={index} className={`trace${block.is_error ? ' is-error' : ''}`}>
              {block.is_error ? 'tool failed' : 'tool returned'}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}
