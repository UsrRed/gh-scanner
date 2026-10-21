import type { Report, Severity } from '../../shared/types.js';
import { redact } from '../redact/index.js';

const SEVS: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function buildMarkdown(r: Report): string {
  const s = r.scan;
  const L: string[] = [];
  L.push(`# Rapport de scan — ${s.repo}`, '');
  L.push(`- Dépôt : ${s.repo}${s.ref ? ` @ ${s.ref}` : ''}`);
  if (s.commitSha) L.push(`- Commit : ${s.commitSha}`);
  L.push(`- Statut : ${s.status}${r.partial ? ' (résultat partiel)' : ''}`);
  L.push(`- Score : ${r.score}/100 (${r.scoreFormula})`);
  L.push(`- Verdict Claude : ${r.claudeVerdict ?? 'n/a'}`, '');
  if (r.justification) L.push('## Justification', '', r.justification, '');
  L.push('## Compteurs', '', '| Sévérité | Nombre |', '|---|---|');
  for (const v of SEVS) L.push(`| ${v} | ${r.counts[v]} |`);
  L.push('', '## Findings', '');
  if (!r.findings.length) L.push('Aucun finding.', '');
  for (const f of r.findings) {
    L.push(`### [${f.severity}] ${f.title}`, '', `- Catégorie : ${f.category} (${f.rule}, source ${f.source})`,
      `- Fichier : ${f.file}${f.line != null ? `:${f.line}` : ''}`, '', f.explanation, '');
    if (f.snippet) L.push('```', f.snippet.replace(/```/g, "'''"), '```', '');
    if (f.fix) L.push(`**Correctif :** ${f.fix}`, '');
  }
  L.push('## Consommation', '', '| Passe | Lot | Modèle | Statut | Tokens in/out | Coût USD |', '|---|---|---|---|---|---|');
  for (const p of r.passes) L.push(`| ${p.pass} | ${p.batch ?? '-'} | ${cell(p.model)} | ${p.status} | ${p.usage.inputTokens}/${p.usage.outputTokens} | ${p.usage.costUsd.toFixed(4)} |`);
  L.push('', `Total : ${s.usage.inputTokens} tokens in, ${s.usage.outputTokens} out, ${s.usage.costUsd.toFixed(4)} USD`, '');
  const o = r.outbound;
  L.push('## Sorties réseau', '', `- Fichiers lus par Claude : ${o.files} (${o.bytesToClaude} octets)`, `- Octets de prompts : ${o.promptBytes}`,
    `- Connexions bloquées : ${o.blockedConnections}`, '');
  if (o.destinations.length) {
    L.push('| Hôte | Connexions | Octets envoyés | Octets reçus |', '|---|---|---|---|');
    for (const d of o.destinations) L.push(`| ${cell(d.host)} | ${d.connections} | ${d.bytesUp} | ${d.bytesDown} |`);
    L.push('');
  }
  return redact(L.join('\n'));
}
