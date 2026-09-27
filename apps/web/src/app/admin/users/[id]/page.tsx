import type { Metadata } from 'next';
import { AdminUserDetailScreen } from '../../../../features/administration/admin-screens';
import { WorkspaceAccess } from '../../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Управление пользователем · Marketplace',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WorkspaceAccess scope="admin">
      <AdminUserDetailScreen id={id} />
    </WorkspaceAccess>
  );
}
