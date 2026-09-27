import type { Metadata } from 'next';
import { ReportQueueScreen } from '../../../features/administration/report-moderation-screens';
import { WorkspaceAccess } from '../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Жалобы · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="moderation">
      <ReportQueueScreen />
    </WorkspaceAccess>
  );
}
