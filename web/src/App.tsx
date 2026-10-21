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
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/compare" element={<ComparePage />} />
      </Routes>
    </AppShell>
  );
}
