import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidget } from './ChatWidget';

/**
 * Dev harness. On a dealer's site the widget is mounted by the embed script
 * instead — see mount() below.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const WIDGET_KEY = import.meta.env.VITE_WIDGET_KEY ?? '';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
      <ChatWidget apiBaseUrl={API_BASE_URL} widgetKey={WIDGET_KEY} />
    </div>
  </StrictMode>,
);

/** Mount into any element on the dealer's page. */
export function mount(element: HTMLElement, options: { apiBaseUrl: string; widgetKey: string }) {
  createRoot(element).render(
    <ChatWidget apiBaseUrl={options.apiBaseUrl} widgetKey={options.widgetKey} />,
  );
}

export { ChatWidget };
