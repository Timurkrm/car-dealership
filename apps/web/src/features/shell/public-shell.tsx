import type { ReactNode } from 'react';
import { GlobalHeader } from './global-header';

// Pages own their single main landmark; account/admin keep their feature navigation.
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <GlobalHeader />
      {children}
    </div>
  );
}
