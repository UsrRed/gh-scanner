import type { ScanStatus } from '../../../shared/types';

const STEPS: { key: string; label: string; statuses: ScanStatus[] }[] = [
  { key: 'queued', label: 'En file', statuses: ['queued'] },
  { key: 'cloning', label: 'Clonage', statuses: ['cloning'] },
  { key: 'mapping', label: 'Cartographie', statuses: ['mapping'] },
  { key: 'analyzing', label: 'Analyse ciblée', statuses: ['analyzing'] },
  { key: 'synthesizing', label: 'Synthèse', statuses: ['synthesizing'] },
  { key: 'done', label: 'Terminé', statuses: ['done'] },
];

/** Index de l'étape courante; -1 si le statut est terminal hors succès (l'étape reste inconnue). */
function currentIndex(status: ScanStatus): number {
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

export function StepTrack({ status, detail }: { status: ScanStatus; detail?: string | null }) {
  const idx = currentIndex(status);
  const terminalOk = status === 'done';
  return (
    <div className="track" role="list" aria-label="Progression du scan" data-status={status}>
      {STEPS.map((s, i) => {
        const cls = idx < 0 ? '' : terminalOk || i < idx ? 'done' : i === idx ? 'active' : '';
        return (
          <div key={s.key} role="listitem" className={`st ${cls}`.trim()} data-step={s.key} aria-current={cls === 'active' ? 'step' : undefined}>
            {s.label}
            {cls === 'active' && detail && <small>{detail}</small>}
          </div>
        );
      })}
    </div>
  );
}
