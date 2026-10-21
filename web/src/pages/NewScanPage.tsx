import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Scan } from '../../../shared/types';
import { ApiError, apiPost } from '../api/client';
import { PageHeader } from '../components/PageHeader';

export function NewScanPage() {
  const navigate = useNavigate();
  const [repo, setRepo] = useState('');
  const [ref, setRef] = useState('');
  const [keepClone, setKeepClone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const scan = await apiPost<Scan>('/api/scans', { repo: repo.trim(), ref: ref.trim() || undefined, keepClone });
      navigate(`/scans/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('internal', String(err)));
    } finally {
      setBusy(false);
    }
  };

  const repoErr = error && error.code !== 'invalid_ref' && error.code !== 'network' ? error : null;
  const refErr = error?.code === 'invalid_ref' ? error : null;
  const otherErr = error && !repoErr && !refErr ? error : null;

  return (
    <>
      <PageHeader title="Nouveau scan" sub="Analyse d'un dépôt GitHub avant installation" />
      <form className="scan-card" onSubmit={submit} noValidate>
        <div className="body" style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
          <div className="field">
            <label htmlFor="repo">Dépôt</label>
            <input id="repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name ou https://github.com/owner/name"
              className={repoErr ? 'err' : ''} aria-invalid={!!repoErr} aria-describedby={repoErr ? 'repo-err' : undefined} autoComplete="off" />
            {repoErr && <div id="repo-err" className="err-box" role="alert"><code>{repoErr.code}</code>{repoErr.message}</div>}
          </div>
          <div className="field">
            <label htmlFor="ref">Ref (branche, tag ou commit) — optionnel</label>
            <input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="HEAD par défaut"
              className={refErr ? 'err' : ''} aria-invalid={!!refErr} aria-describedby={refErr ? 'ref-err' : undefined} autoComplete="off" />
            {refErr && <div id="ref-err" className="err-box" role="alert"><code>{refErr.code}</code>{refErr.message}</div>}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', font: '13px var(--mono)' }}>
            <input type="checkbox" checked={keepClone} onChange={(e) => setKeepClone(e.target.checked)} />
            Conserver le clone après le scan
          </label>
          {otherErr && <div className="err-box" role="alert"><code>{otherErr.code}</code>{otherErr.message}</div>}
          <div><button type="submit" className="btn primary" disabled={busy || !repo.trim()}>{busy ? 'Envoi…' : 'Lancer le scan'}</button></div>
        </div>
      </form>
    </>
  );
}
