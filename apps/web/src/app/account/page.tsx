import { AccountNavigation } from '../../features/account/account-navigation';
import { EngagementBoundary } from '../../features/engagement/engagement-boundary';
export default function AccountPage() {
  return (
    <main id="main" className="workspace-page">
      <h1>Личный кабинет</h1>
      <EngagementBoundary>
        <p>Управляйте профилем, безопасностью и уведомлениями.</p>
        <AccountNavigation />
      </EngagementBoundary>
    </main>
  );
}
