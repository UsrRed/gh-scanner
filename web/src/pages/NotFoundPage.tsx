import { Link } from 'react-router-dom';
import { HazardTape } from '../components/HazardTape';
import { EmptyState } from '../components/StateViews';

export function NotFoundPage() {
  return (
    <div data-testid="not-found">
      <HazardTape />
      <EmptyState title="404 · Page introuvable">
        Cette adresse n'existe pas. <Link to="/">Retour au nouveau scan</Link>
      </EmptyState>
    </div>
  );
}
