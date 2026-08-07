import { Link } from 'react-router-dom';

/**
 * Where "Sign up" leads.
 *
 * There is no self-serve registration by design: an account is only useful once
 * a showroom's ERP is connected and its API key is in place, which is a
 * conversation, not a form. This page says so plainly rather than presenting a
 * signup form that could not actually create a working account.
 */
export function RequestAccessPage() {
  return (
    <main className="auth-layout">
      <div className="panel auth-card">
        <div className="auth-mark" aria-hidden="true">
          ◆
        </div>
        <h1>Request access</h1>
        <p className="subtitle">
          Accounts are set up with you directly, so your inventory system is connected and tested
          before your first customer ever chats.
        </p>

        <ol className="steps">
          <li>
            <strong>Tell us about your stock</strong>
            <span>Which system holds your inventory, and roughly how many stones.</span>
          </li>
          <li>
            <strong>We connect it</strong>
            <span>Your developer exposes nine endpoints; we test the connection together.</span>
          </li>
          <li>
            <strong>You go live</strong>
            <span>Paste one snippet into your site and set your assistant's rules.</span>
          </li>
        </ol>

        <a className="btn btn-ink" style={{ width: '100%', textAlign: 'center' }} href="mailto:hello@example.com?subject=Diamond%20Chatbot%20access">
          Email us to get started
        </a>

        <p className="help" style={{ textAlign: 'center' }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
