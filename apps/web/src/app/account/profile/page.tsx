import { AccountNavigation } from '../../../features/account/account-navigation';
import { ProfileScreen } from '../../../features/account/profile-screen';
import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
export const metadata = { title: 'Профиль' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Профиль</h1>
      <AccountNavigation />
      <EngagementBoundary>
        <ProfileScreen />
      </EngagementBoundary>
    </main>
  );
}
