import type { Verdict } from '../../../shared/types';

export const VERDICT_LABEL: Record<Verdict, string> = { trust: 'confiance', caution: 'prudence', 'do-not-install': 'ne pas installer' };
const COLOR: Record<Verdict, string> = { trust: 'var(--ok)', caution: 'var(--med)', 'do-not-install': 'var(--crit)' };

export function VerdictStamp({ verdict, caption }: { verdict: Verdict | null; caption?: string }) {
  if (!verdict) return <div className="stamp caution" data-testid="stamp">non évalué{caption && <small>{caption}</small>}</div>;
  const cls = verdict === 'trust' ? 'trust' : verdict === 'caution' ? 'caution' : '';
  return <div className={`stamp ${cls}`.trim()} data-testid="stamp">{VERDICT_LABEL[verdict]}{caption && <small>{caption}</small>}</div>;
}

export function MiniStamp({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <span className="hint">—</span>;
  return <span className="mini-stamp" style={{ color: COLOR[verdict] }}>{VERDICT_LABEL[verdict]}</span>;
}
