# Map manual QA

Run API and web with `NEXT_PUBLIC_MAP_STYLE_URL` configured to an approved MapLibre
style. Use deterministic published Cars and Parts with READY primary media, including
two nearby public points, one distant public point, and one exact-only listing.

## Desktop

- Open `/cars`; verify Split is selected, list and map are both usable, and attribution
  is visible.
- Pan repeatedly; verify the loading label appears, only the final viewport is applied,
  and browser history is not filled with camera moves.
- Click a cluster; verify bounds are fitted and listings separate at higher zoom.
- Click a marker; verify its compact Vehicle preview and link. Focus/hover the loaded
  list card and verify marker selection. Repeat on `/parts` and check compatibility
  summary.
- Apply make/model/generation and Part compatibility filters; verify list and map agree.
- Pan without pressing “Искать в этой области”; verify list results do not change.
- Press “Искать в этой области”; verify `bbox` enters the URL, cursor/origin is reset,
  and both list and map refresh.
- Set a search bbox or radius, then pan outside it; verify the map remains the
  intersection of product search geography and visible viewport.

## Mobile and keyboard

- At 390 px, verify only List and Map choices are shown, Map fills the useful viewport,
  and the preview does not block mode/navigation controls.
- Complete mode, zoom, search-area and preview actions with keyboard only. Verify focus
  is visible and the selected loaded card receives focus after marker selection.
- Enable reduced motion and verify cluster navigation does not animate.

## Privacy and failures

- Click Near Me, deny permission, and verify both catalogs remain usable with a clear
  message.
- Permit Near Me and Apply; verify exact `lat`, `lng`, radius and map camera are absent
  from the URL and from info logs. Reload and verify the private origin is gone.
- Verify an exact-only listing can occur in radius/list results but never appears on the
  map. Verify cluster center/bounds use the seeded public coordinates.
- Use a missing/invalid style URL and block tile requests; verify the list remains
  usable, an accessible error is shown, and retrying map data preserves old markers.
- Zoom to a broad viewport with more than 500 cells; verify `truncated` feedback asks the
  user to zoom or filter rather than implying that all listings are shown.

Record browser, viewport, style provider, dataset IDs and any console/network errors for
each release candidate. Do not paste exact browser coordinates into QA tickets or logs.
