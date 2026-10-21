import type { ReactNode } from 'react';

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-h">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div>{actions}</div>}
    </header>
  );
}
