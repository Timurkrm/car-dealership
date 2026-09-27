import type { Metadata } from 'next';
import { ModerationDashboard } from '../../features/administration/listing-moderation-screens';
import { WorkspaceAccess } from '../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Модерация · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="moderation">
      <ModerationDashboard />
    </WorkspaceAccess>
  );
}
