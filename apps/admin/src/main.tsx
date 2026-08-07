import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './lib/auth-context';
import { AgentRulesPage } from './pages/AgentRulesPage';
import { AuditPage } from './pages/AuditPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RequestAccessPage } from './pages/RequestAccessPage';
import { ShowroomsPage } from './pages/ShowroomsPage';
import { TenantFormPage } from './pages/TenantFormPage';
import { TranscriptPage } from './pages/TranscriptPage';
import { UsagePage } from './pages/UsagePage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

/** Everything under /app is signed-in and wrapped in the sidebar shell. */
function App({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/request-access" element={<RequestAccessPage />} />

          {/* Signed in */}
          <Route path="/app" element={<App><OverviewPage /></App>} />
          <Route path="/app/showrooms" element={<App><ShowroomsPage /></App>} />
          <Route path="/app/showrooms/new" element={<App><TenantFormPage /></App>} />
          <Route path="/app/showrooms/:id" element={<App><TenantFormPage /></App>} />
          <Route
            path="/app/showrooms/:id/conversations"
            element={<App><ConversationsPage mode="conversations" /></App>}
          />
          <Route
            path="/app/showrooms/:id/conversations/:conversationId"
            element={<App><TranscriptPage /></App>}
          />
          <Route
            path="/app/showrooms/:id/holds"
            element={<App><ConversationsPage mode="holds" /></App>}
          />
          <Route path="/app/showrooms/:id/agent" element={<App><AgentRulesPage /></App>} />
          <Route path="/app/showrooms/:id/usage" element={<App><UsagePage /></App>} />
          <Route path="/app/showrooms/:id/privacy" element={<App><PrivacyPage /></App>} />
          <Route path="/app/audit" element={<App><AuditPage /></App>} />

          {/* The old flat routes, kept so existing bookmarks still land somewhere. */}
          <Route path="/tenants" element={<Navigate to="/app" replace />} />
          <Route path="/tenants/:id" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
