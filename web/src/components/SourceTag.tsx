export function SourceTag({ source }: { source: 'claude' | 'local' }) {
  return <span className={`tag ${source}`}>{source === 'claude' ? 'claude' : 'local'}</span>;
}
