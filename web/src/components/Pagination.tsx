export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const shown = Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize));
  return (
    <div className="pager">
      <span>{shown} sur {total} affichés</span>
      <span className="btns">
        <button type="button" className="btn sm" aria-label="Page précédente" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        <span className="mono" aria-live="polite">{page} / {pages}</span>
        <button type="button" className="btn sm" aria-label="Page suivante" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </span>
    </div>
  );
}
