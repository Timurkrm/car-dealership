import { EngagementBoundary } from '../../../../features/engagement/engagement-boundary';
import { ConversationScreen } from '../../../../features/messaging/conversation-screen';
export const metadata = { title: 'Диалог — Marketplace' };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main" className="workspace-page">
      <EngagementBoundary>
        <ConversationScreen id={id} />
      </EngagementBoundary>
    </main>
  );
}
