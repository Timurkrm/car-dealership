import type { Metadata } from 'next';
import { ModerationListingQueue } from '../../../features/administration/listing-moderation-screens';
import { WorkspaceAccess } from '../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Очередь объявлений · Marketplace',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <WorkspaceAccess scope="moderation">
      <ModerationListingQueue />
    </WorkspaceAccess>
  );
}
