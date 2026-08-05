# Release Candidate User Runbook V1

Use this runbook with synthetic data only. Do not write passwords, tokens or private data in notes.

## Result Fields

For every step, mark:

- PASS
- FAIL
- BLOCKED
- NOT RUN

Stop immediately and mark `NOT READY` for data leakage, silent overwrite, exposed secret, data loss, auth/session export, restore to wrong user or production crash.

## 1. Two Users / Two Devices

### Test User A

1. Register or log in with a dedicated Test User A account.
2. Create `TESTDATA` meal.
3. Create `TESTDATA` weight.
4. Create `TESTDATA` reminder.
5. Create `TESTDATA` goal/habit.
6. Create cloud backup.
7. Sync.
8. PASS only if data is visible for User A and no other user.

### Test User B

1. Register or log in with a dedicated Test User B account in a separate browser profile.
2. Verify User A data is not visible.
3. Create separate `TESTDATA` meal, weight, reminder and backup.
4. Verify User B backup does not show User A backup.
5. PASS only if isolation is strict.

### Device/Profile A and B

1. Open User A in two profiles/devices.
2. Create a marked test item in profile A.
3. Sync and verify arrival in profile B.
4. Go offline in profile B.
5. Change same marked item in profile A and B.
6. Reconnect profile B.
7. Verify conflict state, local wins, remote wins, safe merge and manual conflict path.
8. Verify leader takeover after closing the leader tab.
9. Verify queue drains and rollback path if available.

## 2. Backup/Restore

1. Create synthetic state.
2. Sync.
3. Create cloud backup.
4. Change local synthetic state.
5. Restore.
6. Verify restored keys.
7. Verify auth/session did not change.
8. Verify dirty keys after restore.
9. Verify following sync.
10. Verify from second device/profile.

Extra cases:

- restore on new device
- restore with pending sync
- restore with conflict
- logout during restore
- user switch during restore
- rollback after simulated failure

NOT READY if cross-user restore, auth/session restore, data loss, silent overwrite or false success occurs.

## 3. Notifications

1. Check permission default.
2. Request allow through explicit user action.
3. Send one neutral in-app test notification.
4. Send one neutral system test notification if supported.
5. Test deny path.
6. Test quiet hours.
7. Test batching.
8. Test snooze, complete and skip.
9. Test two tabs and two devices.
10. Log out and verify no notification is sent after logout.
11. Switch user and verify no previous-user notification appears.

Max one clearly marked test notification per step. No private text.

## 4. PWA

1. Install on desktop.
2. Install on mobile or mobile browser if available.
3. Confirm standalone mode.
4. Confirm icon and app name.
5. Load app online.
6. Go offline and reload.
7. Confirm offline shell starts.
8. Reconnect.
9. Deploy or simulate new version.
10. Confirm update available banner.
11. Use update now / skip waiting.
12. Confirm data remains after update.
13. Confirm auth offline timeout is safe.
14. Open lazy centers after offline reload.

NOT READY for reload-loop, data loss, offline shell failure or stuck service worker.

## 5. Import/Export Roundtrip

1. Create synthetic meal, weight, check-in, goal, reminder and achievement.
2. Create selective backup.
3. Verify backup.
4. Export.
5. Import in clean test profile.
6. Preview.
7. Safe merge.
8. Confirm.
9. Check roundtrip.
10. Search export file for forbidden fields:
   - `access_token`
   - `refresh_token`
   - `authorization`
   - `password`
   - `session`
   - `base64`
   - `blob:`
   - `diagnostics`
   - `provider response`
   - API key patterns

No forbidden data may be present.

## 6. Photo Route

Default:

```bash
npm run verify:photo-route
```

Remote preflight:

```bash
npm run verify:photo-route -- --url https://preview-url
```

Do not run paid provider analysis unless server config exists, the user explicitly approves it and the image is synthetic food without personal data.

## 6b. Coach Route

Default:

```bash
npm run verify:coach-route
```

Remote preflight:

```bash
npm run verify:coach-route -- --url https://preview-url
```

In appen:

1. Oppna Adaptive Coach.
2. Kontrollera att regelbaserade rad visas utan provider.
3. Läs datapreview for remote AI.
4. Avbryt utan samtycke och verifiera att inget anrop kors.
5. Aktivera remote AI.
6. Klicka `Skapa AI-forslag`.
7. Vid missing config/rate limit/timeout ska regelbaserad fallback visas.
8. Bekrafta att AI-forslag aldrig sparas som goal/habit/reminder utan granskning.

## 7. Preview Verification

```bash
npm run verify:preview -- https://preview-url
```

PASS only if HTTPS, index, manifest, service worker, icons, API route, SPA reload, forbidden modulepreload and client secret scan are all clean.
## AI Route Security V2

Standardpreflight mot preview ska ge 401 vid saknad auth och aldrig gora provideranrop. Riktig authenticated providerkontroll gors bara manuellt med testkonto och uttryckligt godkannande. Token far inte skrivas ut eller sparas i trace/screenshots.
