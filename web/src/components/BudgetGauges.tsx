import type { Usage } from '../../../shared/types';

function Gauge({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`gauge${pct >= 80 ? ' warn' : ''}`}>
      <div className="lbl"><span>{label}</span><span>{text}</span></div>
      <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BudgetGauges({ usage, budget }: { usage: Usage; budget: { usd: number; tokens: number } }) {
  const tokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  return (
    <div className="gauges">
      <Gauge label="Tokens" value={tokens} max={budget.tokens} text={`${tokens.toLocaleString('fr-FR')} / ${budget.tokens.toLocaleString('fr-FR')}`} />
      <Gauge label="Coût" value={usage.costUsd} max={budget.usd} text={`$${usage.costUsd.toFixed(2)} / $${budget.usd.toFixed(2)}`} />
    </div>
  );
}
