import { useEffect, useState } from 'react';
import type { AuthMe } from '../../shared/api';
import { apiGet, setCsrfToken } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NewScanPage } from './pages/NewScanPage';
import { QueuePage } from './pages/QueuePage';
import { ReportPage } from './pages/ReportPage';
import { HistoryPage } from './pages/HistoryPage';
import { ComparePage } from './pages/ComparePage';
import { ScanLivePage } from './pages/ScanLivePage';
import { EgressPage } from './pages/EgressPage';
import { ScanOutboundPage } from './pages/ScanOutboundPage';
import { DisclosurePage } from './pages/DisclosurePage';

export function App() {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    apiGet<AuthMe>('/api/auth/me').then((m) => { setCsrfToken(m.csrfToken); setMe(m); },
      () => setMe({ authRequired: false, authenticated: true, csrfToken: null }));
  }, [tick]);
  if (!me) return null;
  if (me.authRequired && !me.authenticated) return <LoginPage onLoggedIn={() => setTick((t) => t + 1)} />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<NewScanPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/scans/:id" element={<ScanLivePage />} />
        <Route path="/scans/:id/report" element={<ReportPage />} />
        <Route path="/scans/:id/outbound" element={<ScanOutboundPage />} />
        <Route path="/egress" element={<EgressPage />} />
        <Route path="/disclosure" element={<DisclosurePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </AppShell>
  );
}
