import type { ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

interface Item {
  to: string;
  label: string;
  /** Built and backed by a real endpoint. Anything else is shown but disabled. */
  ready: boolean;
  /**
   * Highlight only on an exact path match. Needed wherever a nav target is a
   * prefix of a deeper route — otherwise "Showrooms" stays lit while you are
   * three levels inside one of them, and two items claim to be current.
   */
  end?: boolean;
}

/**
 * The signed-in shell: a persistent sidebar plus the page.
 *
 * Sections that are not built yet are listed but disabled rather than hidden —
 * it shows where the product is going, without offering a link that would land
 * on a broken page.
 */
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { id } = useParams<{ id: string }>();

  const workspace: Item[] = [
    { to: '/app', label: 'Overview', ready: true, end: true },
    { to: '/app/showrooms', label: 'Showrooms', ready: true, end: true },
  ];

  // Only meaningful once a specific showroom is open.
  const showroom: Item[] = id
    ? [
        { to: `/app/showrooms/${id}`, label: 'Settings', ready: true, end: true },
        { to: `/app/showrooms/${id}/conversations`, label: 'Conversations', ready: true },
        { to: `/app/showrooms/${id}/holds`, label: 'Holds', ready: true },
        { to: `/app/showrooms/${id}/agent`, label: 'Agent rules', ready: true },
        { to: `/app/showrooms/${id}/usage`, label: 'Usage & cost', ready: true },
        { to: `/app/showrooms/${id}/privacy`, label: 'Privacy & limits', ready: true },
      ]
    : [];

  const organisation: Item[] = [
    { to: '/app/audit', label: 'Activity log', ready: true },
    { to: '/app/team', label: 'Team', ready: false },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          Diamond Chatbot
        </NavLink>

        <NavGroup title="Workspace" items={workspace} />
        {showroom.length > 0 && <NavGroup title="This showroom" items={showroom} />}
        <NavGroup title="Organisation" items={organisation} />

        {user?.platformRole === 'platform_admin' && (
          <NavGroup title="Platform" items={[{ to: '/app/platform', label: 'Organisations', ready: false }]} />
        )}

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="sidebar-org">{user?.organisationName ?? 'Platform'}</div>
            <div className="sidebar-email">{user?.email}</div>
          </div>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-main">{children}</div>
    </div>
  );
}

function NavGroup({ title, items }: { title: string; items: Item[] }) {
  return (
    <nav className="nav-group">
      <div className="nav-title">{title}</div>
      {items.map((item) =>
        item.ready ? (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
          >
            {item.label}
          </NavLink>
        ) : (
          <span key={item.to} className="nav-item is-pending" aria-disabled="true">
            {item.label}
            <em>soon</em>
          </span>
        ),
      )}
    </nav>
  );
}
