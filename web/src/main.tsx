import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/app.css';
import { WsProvider } from './ws/WsProvider';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <WsProvider>
      <App />
    </WsProvider>
  </BrowserRouter>,
);
