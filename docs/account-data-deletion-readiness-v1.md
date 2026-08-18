# Account och dataradering readiness V1

Viktkollen kan hantera lokal dataradering och export/import i klienten, men
full kontoradering är inte releaseklar förrän en privileged backend finns.

## Kan göras i klienten

- Exportera användardata före radering.
- Radera lokala Viktkollen-storage keys.
- Radera lokala scannerhistorikposter.
- Logga ut användaren.

## Får inte göras i klienten

- Radera Supabase Auth user med service-role key.
- Radera alla cloud-rader via breda klientqueries.
- Radera betalprovider-kund utan verifierad provider/webhook-kedja.

## Krävs före riktig release med konto

- Authenticated account-deletion API.
- Server-only Supabase admin/service credentials.
- Server-side deletion av `user_backups`, `user_sync_state`,
  `user_sync_events` och `user_sync_items`.
- Audit/logg utan känslig payload.
- Tydlig användarbekräftelse och exportrekommendation före radering.
- Efter deletion: sign out och lokal dataradering.
