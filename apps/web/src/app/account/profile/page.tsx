import { AccountNavigation } from '../../../features/account/account-navigation';
import { ProfileScreen } from '../../../features/account/profile-screen';
import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { Container, PageHeader } from '../../../components/ui/layout';
export const metadata = { title: 'Профиль' };
export default function Page() {
  return (
    <Container as="main" id="main">
      <PageHeader
        title="Профиль"
        description="Ваши данные в Automotive Marketplace."
      />
      <AccountNavigation />
      <EngagementBoundary>
        <ProfileScreen />
      </EngagementBoundary>
    </Container>
  );
}
