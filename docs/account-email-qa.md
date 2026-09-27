# Account and email manual QA

- Register, capture VERIFY_EMAIL locally, confirm and sign in.
- Edit the Unicode display name; reload and inspect public seller name.
- Request an email change with a wrong password, then with the correct password.
- Confirm only the latest link; verify the old link/replay fails and the old email
  receives EMAIL_CHANGED in capture.
- Open two sessions; verify the current marker, revoke the other, then revoke the
  current session and confirm redirect/logout/realtime disconnect.
- Change password and verify other sessions and reset links are revoked.
- Toggle every product email preference; verify mandatory security remains disabled
  in the UI and cannot be submitted as false.
- Create NEW_MESSAGE, saved-search match, favorite status and moderation events;
  run `worker:delivery` and inspect capture without message body/private location.
- Stop/reject the provider, inspect RETRY/backoff, restore it and retry. Verify a
  permanent rejection reaches FAILED and `delivery:retry` requeues it.
- Confirm `/account/notifications` and realtime updates work while provider is down.

External provider smoke requires separate sandbox credentials and is not covered
by the preview checklist.
