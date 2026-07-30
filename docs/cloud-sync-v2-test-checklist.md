# Cloud Sync V2 Test Checklist

## Database

- Run `supabase/cloud_sync_v2.sql` in Supabase SQL Editor.
- Confirm `public.user_sync_items` exists.
- Confirm RLS is enabled and forced on `public.user_sync_items`.
- Confirm an authenticated user can only read, insert, update and delete rows where `user_id = auth.uid()`.
- Confirm `public.user_backups` still contains existing manual backups.

## Security

- Confirm only keys in `syncStorageAllowlist` are synced.
- Confirm keys containing auth, session, token, secret, Supabase or API key terms are rejected.
- Confirm `viktkollen.syncMetadata`, `viktkollen.syncQueue`, device IDs and backup metadata are never uploaded as app payload.

## Sync Flows

- Enable automatic sync while logged in.
- Change profile, weights, meals, check-in, nutrition goals and reminders, then run Sync now.
- Reload on another device/browser and confirm remote-only items download.
- Delete a synced item locally and confirm a tombstone is uploaded.
- Restore from manual Cloud Backup and confirm automatic sync does not run through `user_backups`.

## Conflicts

- Change the same allowlisted key locally and remotely from different devices.
- Confirm arrays with `id` fields merge safely.
- Confirm incompatible payloads create a visible conflict.
- Resolve a conflict with "Behåll lokal" and confirm local data is uploaded.
- Resolve a conflict with "Använd moln" and confirm cloud data replaces local data.

## Offline And Errors

- Go offline, change allowlisted data and confirm queue status is pending/offline.
- Go online and confirm pending sync retries.
- Simulate malformed local JSON and confirm the UI shows a safe error without `NaN`, `undefined`, `null`, `[object Object]` or stack traces.
- Simulate a Supabase error and confirm loading status resets.

## Manual Backup Compatibility

- Create a manual backup.
- Restore a manual backup.
- Favorite and delete manual backups.
- Confirm all backup actions still use `public.user_backups`.
