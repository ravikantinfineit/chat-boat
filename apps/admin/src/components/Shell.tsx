import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <Link to="/tenants" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          Diamond Chatbot
        </Link>
      </header>
      {children}
    </>
  );
}
