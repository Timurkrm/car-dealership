import type { Metadata } from 'next';
import { AdminAuditScreen } from '../../../features/administration/admin-screens';
import { WorkspaceAccess } from '../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Аудит · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="admin">
      <AdminAuditScreen />
    </WorkspaceAccess>
  );
}
