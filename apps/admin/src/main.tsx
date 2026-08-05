import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { TenantFormPage } from './pages/TenantFormPage';
import { TenantListPage } from './pages/TenantListPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/tenants" replace />} />
          <Route path="/tenants" element={<TenantListPage />} />
          <Route path="/tenants/new" element={<TenantFormPage />} />
          <Route path="/tenants/:id" element={<TenantFormPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  </StrictMode>,
);
