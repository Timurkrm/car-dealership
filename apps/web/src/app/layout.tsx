import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../styles/tokens.css';
import './globals.css';
import '../styles/foundation.css';
import '../styles/primitives.css';
import '../styles/shell.css';
import '../styles/home.css';
import { AuthProvider } from '../features/auth/auth-provider';
import { PublicShell } from '../features/shell/public-shell';
import { RealtimeProvider } from '../features/realtime/realtime-provider';
import { FavoriteProvider } from '../features/engagement/favorite-provider';
import '../styles/results.css';

export const metadata: Metadata = {
  title: 'Automotive Marketplace',
  description: 'Платформа для покупки и продажи автомобилей и запчастей.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <RealtimeProvider>
            <FavoriteProvider>
              <PublicShell>{children}</PublicShell>
            </FavoriteProvider>
          </RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
