import { AccountNavigation } from '../../../features/account/account-navigation';
import { SecurityScreen } from '../../../features/account/security-screen';
import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
export const metadata = { title: 'Безопасность аккаунта' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Безопасность</h1>
      <AccountNavigation />
      <EngagementBoundary>
        <SecurityScreen />
      </EngagementBoundary>
    </main>
  );
}
