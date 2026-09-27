import type { Metadata } from 'next';
import { ReportDetailScreen } from '../../../../features/administration/report-moderation-screens';
import { WorkspaceAccess } from '../../../../features/administration/workspace-access';

export const metadata: Metadata = {
  title: 'Рассмотрение жалобы · Marketplace',
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
      <ReportDetailScreen id={id} />
    </WorkspaceAccess>
  );
}
