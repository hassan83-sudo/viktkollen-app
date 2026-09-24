# Supabase 30 October public-table hardening

From the Supabase 30 October behavior change, new tables in `public` no longer receive automatic Data API grants. Existing public tables in this project already had broad grants, including privileges that row level security does not cover.

The reviewed migration `supabase/migrations/20260924110000_public_table_minimum_privileges.sql` was manually applied to Production on 2026-09-24 and verified. Do not create another migration to repeat it. Do not insert or edit Production migration-history records.

## Tables

The migration targets these 13 public tables:

- `place_family_members`
- `place_location_shares`
- `place_e2ee_live_locations`
- `place_trip_shares`
- `place_shared_route_points`
- `place_safety_alerts`
- `place_safe_places`
- `place_voice_calls`
- `place_voice_call_signals`
- `reminder_push_schedules`
- `social_locations`
- `social_board_posts`
- `social_room_videos`

`public.user_entitlements` is legacy and does not exist in Production. It was intentionally excluded. Current billing authority remains `billing.subscriptions` and `billing.plan_entitlements`.

## Production verification

Precheck and post-check both reported 13 target tables, 13 tables with row level security enabled, and 44 policies.

| Check | Result |
| --- | --- |
| Forbidden anon grants on non-public-social targets | 0 |
| `social_board_posts` and `social_room_videos` anon SELECT | 2, preserved |
| Social anon write or extra grants | 0 |
| `anon`, `authenticated`, and `service_role` REFERENCES, TRIGGER, or TRUNCATE | 0 |
| `postgres` REFERENCES, TRIGGER, and TRUNCATE | 13 each, owner privileges, expected |
| Row level security | stayed enabled on all 13 tables |
| Policies | 44 remained |
| Data, table, or column mutation | none |

Repository checks for this contract evaluate `anon`, `authenticated`, and `service_role`. Owner privileges held by `postgres` are not an application-role failure.

## Future migrations

`npm run supabase:security-check` fails a future `CREATE TABLE` in `public` that does not state explicit privilege, row level security, and policy intent. It is part of `npm run validate:release-candidate` and is covered by `npm test`.
