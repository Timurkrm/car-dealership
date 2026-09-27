# Moderation/Admin manual QA

Use a local USER seller, a second USER reporter, a MODERATOR and an ADMIN. Grant development ADMIN only through the documented command. Do not use production data.

## Listing moderation

- Open `/moderation/listings` at desktop and mobile widths; verify loading, empty, error, type filter, refresh and Load more.
- Confirm queue cards label CAR/PART and omit VIN and coordinates.
- Open one Vehicle and one Part; verify sections, READY images, subtype values and history.
- Confirm exact location is labelled private/internal.
- Approve with confirmation; verify success appears only after the response and the listing appears in Search/Map.
- Reject with reason/message/internal note; verify seller result shows message and hides note/moderator.
- Open the same listing in two sessions; decide in one and verify the other reports a conflict and refreshes.
- Remove a published listing; verify explicit confirmation and disappearance from Search/Map.

## Reports

- Create Listing, User and Message reports as a USER.
- Verify self-report and duplicate active report errors are understandable.
- Filter `/moderation/reports`, paginate and refresh.
- Open MESSAGE detail; verify at most five messages and no full conversation.
- Dismiss a report and resolve a Listing report with content removal; verify confirmations and final state.

## Administration

- Verify MODERATOR receives access denied for `/admin/users` and `/admin/audit`.
- Filter users by status/role/exact email and paginate.
- Suspend and block a non-admin; verify old browser sessions fail immediately.
- Reactivate and verify a fresh login is required.
- Grant/revoke MODERATOR, and grant ADMIN only after explicit confirmation.
- Verify self-demotion and last-active-admin disable/demotion are rejected.
- Filter audit and verify metadata is formatted text, not arbitrary HTML/JSON.

## Accessibility and responsive behavior

- Navigate tables, forms, decisions and confirmation dialogs using only keyboard.
- Verify every input has a label and errors/status changes are announced.
- Check focus visibility and horizontal table scrolling at 320px width.
- Confirm text remains readable in light and dark color schemes.

Record browser/version, viewport, actor role, scenario and observed result. This checklist does not replace automated authorization and integration tests.
