# Staging Test User A/B Acceptance

Skapa två riktiga Supabase Auth-konton i staging:

- Test User A
- Test User B

Använd aldrig productionkonton för detta test.

## Grundflöde

1. Logga in som A i Viktkollen staging.
2. Skapa profil, check-in, vikt, måltid, nutrition goal och sync/backup-data.
3. Logga ut.
4. Logga in som B.
5. Skapa annan profil, check-in, vikt, måltid, nutrition goal och sync/backup-data.
6. Verifiera att UI inte visar A-data.
7. Logga ut och tillbaka till A.
8. Verifiera att UI inte visar B-data.

## SQL-checks

Kör read-only checks i Supabase SQL Editor efter att båda användarna skapat data.
Byt UUID-värdena mot A och B från Auth Users.

```sql
select count(*) as a_sync_items
from public.user_sync_items
where user_id = '<TEST_USER_A_UUID>';

select count(*) as b_sync_items
from public.user_sync_items
where user_id = '<TEST_USER_B_UUID>';

select user_id, storage_key, count(*)
from public.user_sync_items
where user_id in ('<TEST_USER_A_UUID>', '<TEST_USER_B_UUID>')
group by user_id, storage_key
order by user_id, storage_key;

select user_id, plan, status
from public.user_entitlements
where user_id in ('<TEST_USER_A_UUID>', '<TEST_USER_B_UUID>');
```

## Ownership-verifiering

I appen:

- A ska bara se A:s cloud sync, backup och entitlement-state.
- B ska bara se B:s cloud sync, backup och entitlement-state.
- Logout ska återställa privat state och premium ska falla tillbaka till
  `free`/unknown tills servern svarar för nästa användare.

I SQL/RLS:

- SELECT ska scopa via `auth.uid() = user_id`.
- INSERT ska sätta eller kräva aktuell användare.
- UPDATE ska bara tillåta egen rad.
- DELETE ska bara tillåta egen rad.
- `user_entitlements` ska inte ha client write policy.

## Account deletion

1. Kör `POST /api/account-deletion` med `mode=dry-run` för A.
2. Kontrollera att inga rader raderades.
3. Kör `mode=cloud-data` först i staging när admin-env är satt.
4. Verifiera att bara A:s cloud-rader försvann.
5. Verifiera att B:s rader finns kvar.
6. Kör `mode=account` först när `ACCOUNT_DELETION_ENABLE_AUTH_DELETE=true`
   är avsiktligt satt i staging.

Stoppa direkt om B:s data påverkas av A:s flöde.
