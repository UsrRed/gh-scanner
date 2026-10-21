import { Fragment, type ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import { useApi } from '../hooks/useApi';

/** Minimal safe Markdown → React (no raw HTML; every string is a text node). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <code key={m.index}>{m[1]}</code> : <strong key={m.index}>{m[2]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.startsWith('```')) {
      const buf: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) buf.push(lines[i]!);
      i++;
      out.push(<pre key={i} className="mono">{buf.join('\n')}</pre>);
    } else if (/^#{1,6}\s/.test(l)) {
      const level = Math.min(6, l.match(/^#+/)![0].length);
      const H = `h${level}` as 'h1';
      out.push(<H key={i}>{inline(l.replace(/^#+\s*/, ''))}</H>);
      i++;
    } else if (/^\s*[-*]\s/.test(l)) {
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*]\s/.test(lines[i]!); i++) items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
      out.push(<ul key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (l.trim() === '') {
      i++;
    } else {
      const buf: string[] = [];
      for (; i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,6}\s|```|\s*[-*]\s)/.test(lines[i]!); i++) buf.push(lines[i]!);
      out.push(<p key={i}>{buf.map((t, k) => <Fragment key={k}>{k > 0 && ' '}{inline(t)}</Fragment>)}</p>);
    }
  }
  return out;
}

export function DisclosurePage() {
  const { data, error, loading, reload } = useApi<{ markdown: string }>('/api/disclosure');
  let body;
  if (!data && loading) body = <LoadingState label="Chargement…" />;
  else if (!data && error) body = <ErrorState code={error.code} message={error.message} onRetry={reload} />;
  else if (!data || !data.markdown.trim()) body = <EmptyState title="Aucun contenu" />;
  else body = <article className="panel" data-testid="disclosure">{renderMarkdown(data.markdown)}</article>;
  return (<><PageHeader title="Ce que ce logiciel envoie et à qui" />{body}</>);
}
