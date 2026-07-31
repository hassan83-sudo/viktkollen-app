# Runtime Error Recovery V1

Viktkollen ska inte bli obrukbar av ett enskilt renderfel, storagefel,
importfel eller async-fel. Användaren ska få kort svensk feedback och kunna
försöka igen utan att data raderas automatiskt.

## Feltyper

- `storage_quota`: webbläsarens lokala lagring är full.
- `storage_security`: webbläsaren blockerar lokal lagring.
- `import`: trasig JSON eller fel schema vid filimport.
- `network`: fetch, offline eller allmän nätverksstörning.
- `supabase`: moln/auth/Supabase-relaterat fel.
- `clipboard`: automatisk kopiering misslyckades.
- `snapshot`: hälsosnapshotens kontrakt eller visning fallerar.
- `unknown`: oväntat fel.

## Användarmeddelanden

UI ska visa neutral svensk text. Exempel:

- “Något gick fel. Försök igen om en stund.”
- “Nätverket verkar strula. Kontrollera anslutningen och försök igen.”
- “Filen kunde inte läsas. Kontrollera att den är en giltig Viktkollen-fil.”
- “Lagringsutrymmet verkar vara fullt. Din befintliga data har inte raderats.”

UI får aldrig visa stack traces, råa objekt, tokenvärden, Supabase-nycklar,
`undefined`, `null`, `NaN`, `Infinity`, `true`, `false` eller
`[object Object]`.

## Development-Loggning

`logAppError` loggar teknisk diagnostik endast i development. UI använder alltid
sanerad text från `getSafeErrorMessage`.

## Recovery-Flöden

`AppErrorBoundary` erbjuder:

- `Försök igen`: återställer den trasiga vyn.
- `Ladda om appen`: kontrollerad reload.
- `Gå till startsidan`: nollställer boundaryn och hoppar till `#hem`.

Ingen recovery-knapp raderar användardata. “Rensa all data” är inte en generell
felåtgärd.

## Storage-Fel

`appStorageService` behåller de befintliga API:erna:

- `readStorage`
- `writeStorage`
- `removeStorage`

Dessutom finns result-varianter:

- `readStorageResult`
- `writeStorageResult`
- `removeStorageResult`

De returnerar `ok`, `type`, `reason` och fallbackvärde där det är relevant.
Trasig JSON ger fallback utan att radera lagrad data. Skrivfel returnerar status
och lämnar befintlig data orörd.

## Import/Export

Importflöden ska parsa och validera innan React-state uppdateras. Om parsing
eller schemafel uppstår ska nuvarande state lämnas oförändrat och användaren få
en neutral svensk status.

## Snapshot

I development/test ska snapshot-kontraktsbrott ge tydlig diagnostik. I
production ska displayfält saneras så tekniska värden inte läcker till UI.
