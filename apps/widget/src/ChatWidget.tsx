import { useEffect, useRef, useState } from 'react';
import type { Diamond, DiamondSummary } from '@diamond/shared';
import { useChat, type Turn } from './useChat';
import './widget.css';

export interface ChatWidgetProps {
  apiBaseUrl: string;
  widgetKey: string;
  greeting?: string;
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function DiamondCard({ diamond }: { diamond: DiamondSummary }) {
  return (
    <article className="dc-card">
      {diamond.image_urls?.[0] && (
        <img className="dc-card-img" src={diamond.image_urls[0]} alt="" loading="lazy" />
      )}
      <div className="dc-card-body">
        <div className="dc-card-title">
          {diamond.carat} ct {diamond.shape}
        </div>
        <div className="dc-card-specs">
          {[diamond.color, diamond.clarity, diamond.cut].filter(Boolean).join(' · ')}
        </div>
        <div className="dc-card-price">{money(diamond.price, diamond.currency)}</div>
        <div className="dc-card-meta">
          {diamond.diamond_id}
          {diamond.certificate_no ? ` · ${diamond.certificate_no}` : ''}
        </div>
      </div>
    </article>
  );
}

function ComparisonTable({ diamonds }: { diamonds: Diamond[] }) {
  const rows: [string, (d: Diamond) => string][] = [
    ['Carat', (d) => String(d.carat)],
    ['Shape', (d) => d.shape ?? '—'],
    ['Colour', (d) => d.color ?? '—'],
    ['Clarity', (d) => d.clarity ?? '—'],
    ['Cut', (d) => d.cut ?? '—'],
    ['Polish', (d) => d.polish ?? '—'],
    ['Symmetry', (d) => d.symmetry ?? '—'],
    ['Fluorescence', (d) => d.fluorescence ?? '—'],
    ['Price', (d) => money(d.price, d.currency)],
  ];

  return (
    <div className="dc-compare-wrap">
      <table className="dc-compare">
        <thead>
          <tr>
            <th />
            {diamonds.map((d) => (
              <th key={d.diamond_id}>{d.diamond_id}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {diamonds.map((d) => (
                <td key={d.diamond_id}>{get(d)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Receipt({ kind, data }: { kind: string; data: Record<string, unknown> }) {
  const title =
    kind === 'hold' ? 'Reserved for you' : kind === 'quotation' ? 'Quotation ready' : 'Order confirmed';

  return (
    <div className="dc-receipt">
      <div className="dc-receipt-title">{title}</div>
      <dl>
        {Object.entries(data)
          .filter(([key]) => !key.startsWith('_'))
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/_/g, ' ')}</dt>
              <dd>
                {typeof value === 'string' && value.startsWith('http') ? (
                  <a href={value} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : (
                  String(value)
                )}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  return (
    <div className={`dc-turn dc-turn-${turn.role}`}>
      {turn.text && <div className="dc-bubble">{turn.text}</div>}
      {turn.cards && turn.cards.length > 0 && (
        <div className="dc-cards">
          {turn.cards.map((d) => (
            <DiamondCard key={d.diamond_id} diamond={d} />
          ))}
        </div>
      )}
      {turn.comparison && <ComparisonTable diamonds={turn.comparison} />}
      {turn.receipts?.map((r, i) => (
        <Receipt key={i} kind={r.kind} data={r.data} />
      ))}
    </div>
  );
}

export function ChatWidget({
  apiBaseUrl,
  widgetKey,
  greeting = 'Hi — tell me what you are looking for and I will search our stock. Shape, carat, budget, anything.',
}: ChatWidgetProps) {
  const { turns, status, busy, send } = useChat({ apiBaseUrl, widgetKey });
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, status]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft;
    setDraft('');
    void send(text);
  }

  return (
    <div className="dc-widget">
      <header className="dc-header">Diamond assistant</header>

      <div className="dc-scroll" ref={scrollRef}>
        {turns.length === 0 && <div className="dc-greeting">{greeting}</div>}
        {turns.map((turn) => (
          <TurnBubble key={turn.id} turn={turn} />
        ))}
        {status && <div className="dc-status">{status}…</div>}
      </div>

      <form className="dc-composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Round, 1 carat, VS1 or better, under $6000"
          aria-label="Message"
        />
        <button className="dc-send" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
