# Messaging manual QA

Use two active accounts in separate browser profiles (buyer and seller), plus two tabs
for one account. Test with both a published Vehicle and Part listing.

- Open each detail page as buyer; contact CTA opens the same dialog on repeated clicks.
- Confirm the CTA is hidden for the seller and an anonymous click returns after login.
- Send multiline and Unicode text; verify it renders as text, never markup.
- Throttle/offline during send; verify failed state and retry produces one bubble.
- Keep seller inbox and conversation open in separate tabs; verify message, inbox order,
  message unread and notification unread update without reload.
- Mark read in one tab; verify the other tab catches up and a delayed older read cannot
  restore unread state.
- Reload and disconnect/reconnect the network; verify HTTP restores missed data.
- Log out, suspend and block an account; verify its socket disconnects within the bounded
  revalidation window and protected HTTP calls stop.
- Try a copied conversation URL as a third user; verify safe 404 and no socket room join.
- Report the other participant's message and verify it appears in the existing moderation
  queue; verify reporting one's own message is rejected.
- Stop Redis after connection, send over HTTP, restart Redis/worker and verify the Message
  remains in history and its notification is eventually created once.

Record browser/profile, timestamps and failures. Automated tests cover the durable and
authorization paths; do not treat this checklist as executed unless those browser steps
were actually performed.
