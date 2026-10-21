// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState, ErrorState, LoadingState } from '../../web/src/components/StateViews';

afterEach(cleanup);

describe('StateViews', () => {
  it('renders empty and loading', () => {
    render(<><EmptyState title="Aucun scan">Rien ici</EmptyState><LoadingState /></>);
    expect(screen.getByText('Aucun scan')).toBeTruthy();
    expect(screen.getByText('Chargement…')).toBeTruthy();
  });
  it('error retry button calls the callback', async () => {
    const onRetry = vi.fn();
    render(<ErrorState code="internal" message="boom" onRetry={onRetry} />);
    expect(screen.getByText('boom')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
