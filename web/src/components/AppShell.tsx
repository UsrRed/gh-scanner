import type { ReactNode } from 'react';
import { Nav } from './Nav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Nav />
      <main className="main">{children}</main>
    </div>
  );
}
