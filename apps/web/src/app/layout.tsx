import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AuthProvider } from '../features/auth/auth-provider';
import Link from 'next/link';
import { WorkspaceNavigation } from '../features/administration/workspace-navigation';
import { EngagementNavigation } from '../features/engagement/engagement-navigation';
import { RealtimeProvider } from '../features/realtime/realtime-provider';

export const metadata: Metadata = {
  title: 'Автомобильная платформа',
  description: 'Платформа для покупки и продажи автомобилей и запчастей.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main">
          Перейти к содержимому
        </a>
        <AuthProvider>
          <RealtimeProvider>
            <nav className="site-nav" aria-label="Основная навигация">
              <Link href="/">Главная</Link>
              <Link href="/cars">Автомобили</Link>
              <Link href="/parts">Запчасти</Link>
              <Link href="/sell">Продать</Link>
              <Link href="/account/listings">Мои объявления</Link>
              <Link href="/account">Аккаунт</Link>
              <EngagementNavigation />
              <WorkspaceNavigation />
            </nav>
            {children}
          </RealtimeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
