import type { FindingCategory, RiskLevel, RiskMatrix, Severity } from '../../shared/types.js';

export const RISK_LEVELS: RiskLevel[] = ['very-low', 'low', 'medium', 'high', 'very-high'];

const BASE: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

const THREAT: Record<FindingCategory, string> = {
  secrets: 'Vol et réutilisation d’identifiants exposés',
  injection: 'Exécution de code ou de requêtes arbitraires par un attaquant',
  deserialization: 'Exécution de code via des données désérialisées non fiables',
  dependencies: 'Compromission via une dépendance vulnérable ou malveillante',
  'ci-cd': 'Détournement du pipeline CI/CD (secrets, publication de code)',
  'install-scripts': 'Exécution de code à l’installation chez l’utilisateur',
  obfuscation: 'Dissimulation d’un comportement malveillant',
  exfiltration: 'Fuite de données vers un tiers',
  quality: 'Défaut de robustesse ou de maintenance exploitable indirectement',
  'prompt-injection': 'Détournement d’un agent IA par instructions cachées',
  'sandbox-violation': 'Tentative de sortie du périmètre d’analyse',
  symlink: 'Lecture de fichiers hors du dépôt via un lien symbolique',
};

/** Categories where exploitation is typically easier (+1 probability) or consequences milder (−1 impact). */
const EASY: FindingCategory[] = ['secrets', 'install-scripts', 'exfiltration', 'prompt-injection'];

export const isRiskLevel = (v: unknown): v is RiskLevel => typeof v === 'string' && (RISK_LEVELS as string[]).includes(v);

/** Deterministic matrix from category + severity (+ title as the vulnerability). */
export function deriveRisk(f: { category: FindingCategory; severity: Severity; title: string; rule?: string }): RiskMatrix {
  const b = BASE[f.severity] ?? 0;
  const p = Math.min(4, b + (EASY.includes(f.category) && b > 0 ? 1 : 0));
  const i = Math.max(0, b - (f.category === 'quality' ? 1 : 0));
  return { vulnerability: f.title || f.rule || f.category, threat: THREAT[f.category] ?? THREAT.quality,
    probability: RISK_LEVELS[p] ?? 'medium', impact: RISK_LEVELS[i] ?? 'medium' };
}

/** Uses valid Claude-provided fields, falling back per field on the derived value. */
export function resolveRisk(f: { category: FindingCategory; severity: Severity; title: string; rule?: string; risk?: Partial<RiskMatrix> | null }): RiskMatrix {
  const d = deriveRisk(f); const r = f.risk ?? {};
  const txt = (v: unknown, fb: string): string => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : fb);
  return { vulnerability: txt(r.vulnerability, d.vulnerability), threat: txt(r.threat, d.threat),
    probability: isRiskLevel(r.probability) ? r.probability : d.probability, impact: isRiskLevel(r.impact) ? r.impact : d.impact };
}
