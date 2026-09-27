import type { Metadata } from 'next';
import { AdminUsersScreen } from '../../../features/administration/admin-screens';
import { WorkspaceAccess } from '../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Пользователи · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="admin">
      <AdminUsersScreen />
    </WorkspaceAccess>
  );
}
