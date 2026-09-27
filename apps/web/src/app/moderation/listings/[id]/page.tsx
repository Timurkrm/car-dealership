import type { Metadata } from 'next';
import { ModerationListingDetailScreen } from '../../../../features/administration/listing-moderation-screens';
import { WorkspaceAccess } from '../../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Проверка объявления · Marketplace',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <WorkspaceAccess scope="moderation">
      <ModerationListingDetailScreen id={id} />
    </WorkspaceAccess>
  );
}
