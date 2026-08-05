/**
 * Wire format between the widget and our own API (not the ERP).
 *
 * The bot answers in two channels at once: natural-language text, and
 * structured product cards the widget renders. Cards are emitted from tool
 * results rather than parsed out of the model's prose.
 */

import type { Diamond, DiamondSummary } from './diamond';

export interface SendMessageRequest {
  /** Omit to start a new conversation; the server returns the new id. */
  conversation_id?: string;
  text: string;
}

export type ChatStreamEvent =
  /** Conversation id, sent once at the start of a new conversation. */
  | { type: 'conversation'; conversation_id: string }
  /** Incremental assistant text. */
  | { type: 'text'; delta: string }
  /** The bot is calling the ERP; lets the widget show "Checking stock…". */
  | { type: 'tool'; name: string; label: string }
  /** Product cards to render alongside the text. */
  | { type: 'cards'; diamonds: DiamondSummary[] }
  /** Side-by-side comparison table. */
  | { type: 'comparison'; diamonds: Diamond[] }
  /** A hold, quotation or order was created — render a confirmation block. */
  | { type: 'receipt'; kind: 'hold' | 'quotation' | 'order'; data: Record<string, unknown> }
  /** Turn finished. */
  | { type: 'done' }
  /** Something went wrong, including a model refusal. */
  | { type: 'error'; message: string };
