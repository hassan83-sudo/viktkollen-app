-- Social-room friend locations: recipient/device-specific E2EE envelopes.
-- Coordinates remain encrypted in the database and are decrypted only on a recipient device.

create table if not exists public.social_location_envelopes (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_device_id text not null,
  sender_device_id text not null,
  encrypted_payload text not null,
  encrypted_iv text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, recipient_user_id, recipient_device_id),
  constraint social_location_envelopes_not_self check (owner_user_id <> recipient_user_id)
);

create index if not exists social_location_envelopes_recipient_idx
on public.social_location_envelopes (recipient_user_id, recipient_device_id, updated_at desc);

alter table public.social_location_envelopes enable row level security;
alter table public.social_location_envelopes force row level security;

drop policy if exists social_location_envelopes_select_participants on public.social_location_envelopes;
create policy social_location_envelopes_select_participants
on public.social_location_envelopes for select to authenticated
using (
  (select auth.uid()) = owner_user_id
  or (
    (select auth.uid()) = recipient_user_id
    and exists (
      select 1 from public.social_friendships f
      where f.user_low = least(owner_user_id, recipient_user_id)
        and f.user_high = greatest(owner_user_id, recipient_user_id)
    )
  )
);

drop policy if exists social_location_envelopes_insert_owner on public.social_location_envelopes;
create policy social_location_envelopes_insert_owner
on public.social_location_envelopes for insert to authenticated
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.social_friendships f
    where f.user_low = least(owner_user_id, recipient_user_id)
      and f.user_high = greatest(owner_user_id, recipient_user_id)
  )
);

drop policy if exists social_location_envelopes_update_owner on public.social_location_envelopes;
create policy social_location_envelopes_update_owner
on public.social_location_envelopes for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.social_friendships f
    where f.user_low = least(owner_user_id, recipient_user_id)
      and f.user_high = greatest(owner_user_id, recipient_user_id)
  )
);

drop policy if exists social_location_envelopes_delete_owner on public.social_location_envelopes;
create policy social_location_envelopes_delete_owner
on public.social_location_envelopes for delete to authenticated
using ((select auth.uid()) = owner_user_id);

-- The legacy table is retained only for the on/off state during this small sprint.
-- Remove all readable coordinates and prevent friends from selecting legacy rows.
update public.social_locations
set latitude = null, longitude = null, accuracy_meters = null;

drop policy if exists social_locations_select_friends on public.social_locations;
create policy social_locations_select_own
on public.social_locations for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists social_locations_insert_own on public.social_locations;
create policy social_locations_insert_own
on public.social_locations for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists social_locations_update_own on public.social_locations;
create policy social_locations_update_own
on public.social_locations for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table public.social_locations enable row level security;
alter table public.social_locations force row level security;

revoke all on public.social_locations from anon;
revoke all on public.social_location_envelopes from anon;
revoke all on public.social_locations from authenticated;
revoke all on public.social_location_envelopes from authenticated;
grant select, insert, update, delete on public.social_locations to authenticated;
grant select, insert, update, delete on public.social_location_envelopes to authenticated;
