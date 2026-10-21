import type { OutboundSummary as Summary } from '../../../shared/types';

const bytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1).replace('.', ',')} Ko` : `${n} o`);

export function OutboundSummary({ outbound }: { outbound: Summary }) {
  return (
    <div className="receipt">
      <h3>Récapitulatif des sorties</h3>
      <dl className="kv">
        <dt>fichiers transmis</dt><dd>{outbound.files}</dd>
        <dt>octets → Anthropic</dt><dd>{bytes(outbound.bytesToClaude)}</dd>
        <dt>taille des prompts</dt><dd>{bytes(outbound.promptBytes)}</dd>
        {outbound.destinations.map((d) => <><dt key={`t${d.host}`}>{d.host}</dt><dd key={`d${d.host}`}>{d.connections} conn.</dd></>)}
        <dt style={outbound.blockedConnections ? { color: 'var(--crit)' } : undefined}>bloquées</dt>
        <dd style={outbound.blockedConnections ? { color: 'var(--crit)' } : undefined}>{outbound.blockedConnections}</dd>
      </dl>
    </div>
  );
}
