import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { FavoritesScreen } from '../../../features/engagement/favorites-screen';
export const metadata = { title: 'Избранное' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Избранное</h1>
      <EngagementBoundary>
        <FavoritesScreen />
      </EngagementBoundary>
    </main>
  );
}
