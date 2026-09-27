# Engagement manual QA

Run the API, web app, engagement worker, and supporting infrastructure. Use two
verified users so the seller and buyer are distinct.

- Open a published Car and Part while signed out; verify the favorite control
  offers sign-in and does not mutate state.
- Sign in, add both listings from result cards and detail pages, then open
  `/account/favorites`; verify mixed cards, type filters, removal, and Load more.
- Archive one favorited listing as its seller, run the worker, and verify the
  favorite becomes a content-free unavailable tombstone and the buyer sees a
  generic notification without moderator/internal data.
- Configure Cars filters and save them with notifications. Repeat for Parts with
  category and compatibility filters. Verify duplicates show a safe error.
- Activate Near Me and verify the UI explains that the exact-origin search cannot
  be saved. Search an explicit map area and verify its bbox can be saved.
- Open `/account/saved-searches`; toggle notifications, open the canonical catalog
  URL, and delete a record.
- Publish matching Car and Part listings, run `npm run worker:engagement`, and
  verify one notification per user/listing even when multiple saved searches match.
- Mark one notification read, follow its listing link, mark all read, and verify
  the navigation badge and unread-only filter update.
- Verify an unknown notification type renders generic copy without unsafe HTML or
  an arbitrary link.
- Check keyboard focus, labels, narrow-screen wrapping, loading, empty, and error
  states on all three account pages.

Record browser, viewport, user IDs, listing IDs, and failures. Never record access
tokens, cookies, exact location coordinates, or private moderation notes.
