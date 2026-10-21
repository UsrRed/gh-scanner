import { useState } from 'react';
import type { AuthMe } from '../../../shared/api';
import { ApiError, apiGet, apiPost, setCsrfToken } from '../api/client';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost('/api/auth/login', { password });
      const me = await apiGet<AuthMe>('/api/auth/me');
      setCsrfToken(me.csrfToken);
      setPassword('');
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError
        ? (err.status === 401 ? 'Mot de passe incorrect.' : err.status === 429 ? `429 · ${err.message}` : err.message)
        : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login" style={{ marginTop: '12vh' }}>
      <div className="tape" />
      <form className="in" onSubmit={submit}>
        <div className="brand" style={{ padding: '0 0 16px', border: 0 }}><span className="brand-mark" />gh-scanner</div>
        <div className="field">
          <label htmlFor="admin-password">Mot de passe administrateur</label>
          <input id="admin-password" type="password" autoComplete="current-password" autoFocus value={password}
            className={error ? 'err' : undefined} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="hint err" role="alert" style={{ margin: '6px 0 12px' }}>{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || !password} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
          Entrer
        </button>
      </form>
    </div>
  );
}
