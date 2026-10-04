import { AccountNavigation } from '../../../features/account/account-navigation';
import { SecurityScreen } from '../../../features/account/security-screen';
import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { Container, PageHeader } from '../../../components/ui/layout';
export const metadata = { title: 'Безопасность аккаунта' };
export default function Page() {
  return (
    <Container as="main" id="main">
      <PageHeader title="Безопасность" />
      <AccountNavigation />
      <EngagementBoundary>
        <SecurityScreen />
      </EngagementBoundary>
    </Container>
  );
}
