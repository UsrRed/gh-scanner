import type { PassUsage, Usage } from '../../../shared/types';

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));
const usd = (n: number) => n.toFixed(2).replace('.', ',');
const NAME = { mapping: '1 · carto', targeted: '2 · ciblée', synthesis: '3 · synthèse' } as const;

export function UsageTable({ passes, total }: { passes: PassUsage[]; total: Usage }) {
  return (
    <div className="panel">
      <h3>Consommation</h3>
      <table>
        <thead><tr><th>Passe</th><th className="num">in</th><th className="num">out</th><th className="num">cache</th><th className="num">$</th></tr></thead>
        <tbody>
          {passes.map((p, i) => (
            <tr key={i}>
              <td className="mono">{NAME[p.pass]}{p.batch ? ` · ${p.batch}` : ''}{p.status !== 'ok' ? ` (${p.status})` : ''}</td>
              <td className="num">{k(p.usage.inputTokens)}</td><td className="num">{k(p.usage.outputTokens)}</td>
              <td className="num">{k(p.usage.cacheReadTokens)}</td><td className="num">{usd(p.usage.costUsd)}</td>
            </tr>
          ))}
          <tr data-testid="usage-total">
            <td className="mono"><b>Total</b></td><td className="num"><b>{k(total.inputTokens)}</b></td><td className="num"><b>{k(total.outputTokens)}</b></td>
            <td className="num"><b>{k(total.cacheReadTokens)}</b></td><td className="num"><b>{usd(total.costUsd)}</b></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
