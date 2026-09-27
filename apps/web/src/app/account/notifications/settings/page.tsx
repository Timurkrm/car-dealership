import { AccountNavigation } from '../../../../features/account/account-navigation';
import { NotificationSettingsScreen } from '../../../../features/account/notification-settings-screen';
import { EngagementBoundary } from '../../../../features/engagement/engagement-boundary';
export const metadata = { title: 'Настройки уведомлений' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Настройки уведомлений</h1>
      <AccountNavigation />
      <EngagementBoundary>
        <NotificationSettingsScreen />
      </EngagementBoundary>
    </main>
  );
}
