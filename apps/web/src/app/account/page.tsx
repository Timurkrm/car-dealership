import { AccountNavigation } from '../../features/account/account-navigation';
import { AccountLogout } from '../../features/account/account-logout';
import { EngagementBoundary } from '../../features/engagement/engagement-boundary';
export default function AccountPage() {
  return (
    <main id="main" className="workspace-page">
      <h1>Личный кабинет</h1>
      <EngagementBoundary>
        <p>Управляйте профилем, безопасностью и уведомлениями.</p>
        <AccountNavigation />
        <AccountLogout />
      </EngagementBoundary>
    </main>
  );
}
