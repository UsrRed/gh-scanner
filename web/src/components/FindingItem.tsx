import type { Finding } from '../../../shared/types';
import { RiskMatrix } from './RiskMatrix';
import { SeverityBadge } from './SeverityBadge';
import { SourceTag } from './SourceTag';

const CLS: Record<string, string> = { critical: 'crit', high: 'high', medium: 'medium', low: 'low', info: 'info' };

export function FindingItem({ f }: { f: Finding }) {
  const loc = f.line != null ? `${f.file}:${f.line}` : f.file;
  const lines = f.snippet ? f.snippet.split('\n') : [];
  return (
    <details className={`finding ${CLS[f.severity]}`} data-severity={f.severity}>
      <summary>
        <SeverityBadge severity={f.severity} />
        <span><span className="ttl">{f.title}</span><br /><span className="loc">{loc}</span></span>
        <span><span className="tag">{f.category}</span> <SourceTag source={f.source} /></span>
      </summary>
      <div className="detail">
        {lines.length > 0 && <pre className="snip">{lines.map((l, i) => <span key={i} data-n={(f.line ?? 1) + i}>{l}</span>)}</pre>}
        <RiskMatrix risk={f.risk} />
        <div className="grid2">
          <div><h4>Explication</h4><p>{f.explanation}</p></div>
          <div><h4>Correctif</h4><p>{f.fix}</p></div>
        </div>
        <div className="hint">fingerprint {f.fingerprint.slice(0, 8)}… · règle {f.rule}</div>
      </div>
    </details>
  );
}
