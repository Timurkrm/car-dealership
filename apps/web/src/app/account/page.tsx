import { AccountNavigation } from '../../features/account/account-navigation';
import { AccountLogout } from '../../features/account/account-logout';
import { EngagementBoundary } from '../../features/engagement/engagement-boundary';
import { Container, PageHeader } from '../../components/ui/layout';
import { Card } from '../../components/ui/card';
export default function AccountPage() {
  return (
    <Container as="main" id="main">
      <PageHeader
        title="Личный кабинет"
        description="Управляйте профилем, безопасностью и уведомлениями."
      />
      <EngagementBoundary>
        <Card>
          <AccountNavigation />
          <AccountLogout />
        </Card>
      </EngagementBoundary>
    </Container>
  );
}
