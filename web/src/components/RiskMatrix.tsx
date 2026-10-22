import type { RiskLevel, RiskMatrix as Matrix } from '../../../shared/types';

export const RISK_LABELS: Record<RiskLevel, string> = {
  'very-low': 'très faible', low: 'faible', medium: 'moyenne', high: 'élevée', 'very-high': 'très élevée',
};

export function RiskMatrix({ risk }: { risk: Matrix }) {
  return (
    <div className="risk" data-testid="risk-matrix">
      <h4>Matrice de risque</h4>
      <div className="risk-grid">
        <div><span className="k">Vulnérabilité</span><span data-field="vulnerability">{risk.vulnerability}</span></div>
        <div><span className="k">Menace</span><span data-field="threat">{risk.threat}</span></div>
        <div><span className="k">Probabilité</span><span className={`lvl ${risk.probability}`} data-field="probability">{RISK_LABELS[risk.probability]}</span></div>
        <div><span className="k">Impact</span><span className={`lvl ${risk.impact}`} data-field="impact">{RISK_LABELS[risk.impact]}</span></div>
      </div>
    </div>
  );
}
