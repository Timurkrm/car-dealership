import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { MessagesScreen } from '../../../features/messaging/messages-screen';
export const metadata = { title: 'Сообщения — Marketplace' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Сообщения</h1>
      <EngagementBoundary>
        <MessagesScreen />
      </EngagementBoundary>
    </main>
  );
}
