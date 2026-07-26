# Viktkollen Cloud Sync V2

Cloud Sync V2 lägger till manuell molnbackup, återställning, ångra senaste restore, konfliktkontroll och synkhistorik. LocalStorage är fortfarande appens primära datakälla. Ingen automatisk synk, migrering eller bakgrundsåterställning görs.

## 1. Kör SQL

1. Öppna Supabase Dashboard.
2. Gå till SQL Editor.
3. Klistra in och kör `supabase/cloud_sync_v2.sql`.
4. Kontrollera att tabellerna skapades:
   - `user_backups`
   - `user_sync_state`
   - `user_sync_events`

SQL-filen aktiverar Row Level Security och Force RLS. Användaren ska bara kunna läsa, skapa, uppdatera och ta bort sina egna rader via `auth.uid()`.

## 2. Testa RLS

1. Skapa två testanvändare i appen.
2. Logga in som användare A och skapa en backup.
3. Logga ut och logga in som användare B.
4. Kontrollera att användare B inte ser användare A:s backup.
5. Skapa en backup som användare B och kontrollera att listan bara visar B:s egna rader.

Frontend skickar inte något betrott `user_id`. Databasen sätter ägare med `auth.uid()`.

## 3. Manuell testchecklista

- Skapa molnbackup.
- Förhandsgranska senaste molnversion.
- Kontrollera konfliktstatus och rekommendation.
- Återställ från molnet efter svensk bekräftelse.
- Kontrollera att appen laddar om och använder återställd localStorage-data.
- Ångra senaste återställning.
- Radera en backup.
- Markera favorit.
- Byt namn på backup.
- Importera giltig JSON.
- Testa trasig JSON och kontrollera begripligt felmeddelande.

## 4. Vanliga fel

- **Tabell saknas:** kör `supabase/cloud_sync_v2.sql`.
- **Ej inloggad:** logga in med Supabase Auth innan molnbackup används.
- **RLS/policyfel:** kontrollera att SQL-filen körts helt och att Force RLS/policies finns.
- **Nätverksfel:** kontrollera internetanslutning och Supabase-status.
- **Stor backup:** bilder som ligger i localStorage kan göra backupen tung. Supabase Storage kan införas senare för bilder.

## 5. Säkerhet

- `.env.local` ska inte committas.
- Använd aldrig `service_role`-nyckel i frontend.
- Lägg inte OpenAI-nycklar eller Supabase-hemligheter i `src`, `docs` eller SQL.
- Backupformatet tillåter bara appens allowlistade localStorage-nycklar.
- Auth-token, refresh-token, Supabase-sessioner och lösenord exporteras inte.

## 6. Rollback-plan

Om något blir fel:

1. Använd knappen **Ångra senaste återställning** om felet kom från restore/import.
2. Logga ut/in och kontrollera att lokal data fortfarande finns.
3. Låt Supabase-tabellerna vara kvar, men använd inte molnknapparna förrän SQL/policies är kontrollerade.
4. Om du behöver börja om i molnet, radera bara egna backup-rader som inloggad användare. Radera inte Auth-tabeller.
