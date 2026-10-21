import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { NewScanPage } from './pages/NewScanPage';
import { QueuePage } from './pages/QueuePage';
import { ScanLivePage } from './pages/ScanLivePage';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<NewScanPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/scans/:id" element={<ScanLivePage />} />
      </Routes>
    </AppShell>
  );
}
