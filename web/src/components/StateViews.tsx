import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state empty" role="status">
      <div className="lbl">Aucune donnée</div>
      <div className="empty-ledger">
        <p><strong>{title}</strong></p>
        {children && <p className="hint">{children}</p>}
      </div>
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="state loading" role="status" aria-busy="true">
      <div className="lbl">{label}</div>
      <div className="skel" />
      <div className="skel" style={{ width: '70%' }} />
    </div>
  );
}

export function ErrorState({ code, message, onRetry }: { code?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <div className="err-box">
        {code && <code>{code}</code>}
        {message}
      </div>
      {onRetry && (
        <button type="button" className="btn sm" style={{ marginTop: 12 }} onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
