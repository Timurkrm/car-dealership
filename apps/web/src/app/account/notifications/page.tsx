import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { NotificationsScreen } from '../../../features/engagement/notifications-screen';
export const metadata = { title: 'Уведомления' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Уведомления</h1>
      <EngagementBoundary>
        <NotificationsScreen />
      </EngagementBoundary>
    </main>
  );
}
