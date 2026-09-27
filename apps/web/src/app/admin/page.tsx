import Link from 'next/link';
import type { Metadata } from 'next';
import { WorkspaceAccess } from '../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Администрирование · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="admin">
      <main id="main" className="workspace-page">
        <h1>Администрирование</h1>
        <nav className="workspace-links" aria-label="Разделы администрирования">
          <Link href="/admin/users">Пользователи</Link>
          <Link href="/admin/audit">Аудит безопасности</Link>
        </nav>
      </main>
    </WorkspaceAccess>
  );
}
