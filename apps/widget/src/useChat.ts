import { useCallback, useRef, useState } from 'react';
import type { ChatStreamEvent, Diamond, DiamondSummary } from '@diamond/shared';

/** One rendered bubble. Cards and receipts hang off the assistant's turn. */
export interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: DiamondSummary[];
  comparison?: Diamond[];
  receipts?: { kind: 'hold' | 'quotation' | 'order'; data: Record<string, unknown> }[];
  /**
   * The turn has finished streaming.
   *
   * Cards arrive the moment the search returns, which is before the assistant
   * has written what it thinks of them — showing a list first and explaining it
   * afterwards reads backwards. So they are collected as they arrive and only
   * revealed once the reply is complete.
   */
  complete?: boolean;
}

interface UseChatOptions {
  apiBaseUrl: string;
  widgetKey: string;
}

/**
 * Drives one conversation.
 *
 * The reply arrives as Server-Sent Events over a POST (EventSource can't POST),
 * so the body is read manually and split on the SSE double-newline delimiter.
 */
export function useChat({ apiBaseUrl, widgetKey }: UseChatOptions) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      setStatus(null);

      const assistantId = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text },
        { id: assistantId, role: 'assistant', text: '' },
      ]);

      const patch = (fn: (turn: Turn) => Turn) =>
        setTurns((prev) => prev.map((t) => (t.id === assistantId ? fn(t) : t)));

      try {
        const response = await fetch(`${apiBaseUrl}/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Widget-Key': widgetKey },
          body: JSON.stringify({ conversation_id: conversationId.current ?? undefined, text }),
        });
        if (!response.ok || !response.body) {
          throw new Error(`Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; the last chunk may be partial.
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            const event = JSON.parse(line.slice(6)) as ChatStreamEvent;
            apply(event);
          }
        }

        function apply(event: ChatStreamEvent) {
          switch (event.type) {
            case 'conversation':
              conversationId.current = event.conversation_id;
              break;
            case 'text':
              patch((t) => ({ ...t, text: t.text + event.delta }));
              setStatus(null);
              break;
            case 'tool':
              setStatus(event.label);
              break;
            case 'cards':
              patch((t) => ({ ...t, cards: [...(t.cards ?? []), ...event.diamonds] }));
              break;
            case 'comparison':
              patch((t) => ({ ...t, comparison: event.diamonds }));
              break;
            case 'receipt':
              patch((t) => ({
                ...t,
                receipts: [...(t.receipts ?? []), { kind: event.kind, data: event.data }],
              }));
              break;
            case 'error':
              patch((t) => ({ ...t, text: t.text || event.message }));
              break;
            case 'done':
              setStatus(null);
              break;
          }
        }
      } catch (error) {
        patch((t) => ({
          ...t,
          text: t.text || `Sorry, something went wrong: ${(error as Error).message}`,
        }));
      } finally {
        // Marked here rather than on `done` so a refusal, an error or a dropped
        // connection still reveals whatever was found.
        patch((t) => ({ ...t, complete: true }));
        setBusy(false);
        setStatus(null);
      }
    },
    [apiBaseUrl, widgetKey, busy],
  );

  return { turns, status, busy, send };
}
