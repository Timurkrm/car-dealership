import { EngagementBoundary } from '../../../features/engagement/engagement-boundary';
import { SavedSearchesScreen } from '../../../features/engagement/saved-searches-screen';
export const metadata = { title: 'Сохранённые поиски' };
export default function Page() {
  return (
    <main id="main" className="workspace-page">
      <h1>Сохранённые поиски</h1>
      <EngagementBoundary>
        <SavedSearchesScreen />
      </EngagementBoundary>
    </main>
  );
}
