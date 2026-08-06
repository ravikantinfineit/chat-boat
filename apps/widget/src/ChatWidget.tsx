import { Fragment, useEffect, useRef, useState } from 'react';
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

/**
 * The bubble is plain text with exactly one piece of formatting: **bold**, used
 * for the specifications a customer is weighing up.
 *
 * Deliberately not a markdown library — this widget is embedded on other
 * people's sites, so bundle size counts, and a full parser would also let
 * heading and list syntax back in. Building React nodes rather than setting
 * innerHTML means model output can never inject markup.
 *
 * Splitting on the delimiter also handles streaming for free: an unclosed run,
 * which exists on nearly every frame while text arrives, renders as
 * bold-in-progress instead of flashing literal asterisks.
 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  // Everything structured waits for the reply to finish, so the customer reads
  // the recommendation first and then sees the stones it refers to.
  const showResults = turn.complete;

  return (
    <div className={`dc-turn dc-turn-${turn.role}`}>
      {turn.text && (
        <div className="dc-bubble">
          {turn.role === 'assistant' ? <RichText text={turn.text} /> : turn.text}
        </div>
      )}
      {showResults && turn.cards && turn.cards.length > 0 && (
        <div className="dc-cards dc-reveal">
          {turn.cards.map((d) => (
            <DiamondCard key={d.diamond_id} diamond={d} />
          ))}
        </div>
      )}
      {showResults && turn.comparison && (
        <div className="dc-reveal">
          <ComparisonTable diamonds={turn.comparison} />
        </div>
      )}
      {showResults &&
        turn.receipts?.map((r, i) => (
          <div className="dc-reveal" key={i}>
            <Receipt kind={r.kind} data={r.data} />
          </div>
        ))}
    </div>
  );
}

export function ChatWidget({
  apiBaseUrl,
  widgetKey,
  greeting = 'Tell me a shape, carat weight or budget and I will search our live stock. You can also paste a certificate number.',
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
      <header className="dc-header">
        <span className="dc-header-mark" aria-hidden="true">
          ◆
        </span>
        <span className="dc-header-title">Diamond assistant</span>
        <span className="dc-header-sub">Live stock</span>
      </header>

      <div className="dc-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="dc-greeting">
            <div className="dc-greeting-lead">What are you looking for?</div>
            {greeting}
          </div>
        )}
        {turns.map((turn) => (
          <TurnBubble key={turn.id} turn={turn} />
        ))}
        {status && (
          <div className="dc-status">
            <span className="dc-status-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {status}
          </div>
        )}
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
