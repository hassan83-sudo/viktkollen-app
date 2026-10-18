# PR #39: migration order and main compatibility

The Security Center SQL files use the versions already recorded in Supabase
Staging (`armtslzspuebmlysnooq`):

1. `20261017134129_security_center_events.sql`: schema, table and initial RPCs.
2. `20261017135308_security_center_rpc_bridge.sql`: service-role-only public bridge.
3. `20261017151943_security_center_event_aggregation.sql`: counters and retention.

The first two files previously had later filename timestamps than aggregation.
Only their filenames changed; SQL contents and the already-applied aggregation
version are preserved. No database history needs editing or replaying in Staging.
No remote migration was run as part of this correction. Before applying anywhere
else, compare that environment's migration history; Production still requires
separate approval.

`supabase/securityCenterMigrations.test.js` runs the committed SQL in filename
order in disposable in-memory PostgreSQL. It also verifies existing-row
preservation, aggregation reapplication and denial of client access.

The main merge preserves both `SupportPanel admin` and `SecurityCenterPanel` behind
the existing server-verified admin entry. The entry's regression test checks both
panels are mounted for admins and hidden for non-admins. Main's accessibility fix
for SmartCameraChecklists is retained without changing that feature.

The existing confirmation-dialog accessibility gate normalizes filesystem paths
before comparing its allowlist, so the same check works on Windows and Linux.
The allowlist still permits only the existing four CloudBackupPanel calls.

## Support browser fixture after the main merge

The paid-support browser test also mounts Security Center. Its polling endpoint
was not mocked, so the local Vite server returned its HTML fallback instead of
the deployed API's JSON. A failing trace showed the page reloading and removing
the queue while Playwright was waiting to click Save; the admin command was not
sent. The fixture now explicitly fulfills `/api/security-center` and waits for
the panel's loaded state before exercising support. No production handler,
timeout, click behavior or support assertions were relaxed. The affected flow
passed three consecutive local runs with the corrected offline fixture.
