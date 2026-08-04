# Two User / Two Device Test Guide V1

## Testkonton

Anvand dedikerade konton:

- Test User A
- Test User B

Anvand aldrig privat data. Anvand namn och objekt som borjar med `TESTDATA`.

## Browserprofiler

Rekommenderat:

- Profil 1: Test User A
- Profil 2: Test User B
- Valfritt tredje lage: installerad PWA eller fysisk mobil

## Flode

1. Logga in som Test User A i profil 1.
2. Skapa markerad testvikt, testmaltid, check-in, reminder och coach action.
3. Synka/backup enligt Cloud Sync-panelen.
4. Logga in som Test User A i profil 2 och verifiera att samma testdata anlander.
5. Skapa kontrollerad konflikt: andra samma markerade testobjekt i bada profilerna innan sync.
6. Verifiera att konflikten visas som konflikt och inte tyst skrivs over.
7. Logga in som Test User B och verifiera att User A:s data inte syns.
8. Testa logout och kontrollera att notifications/sync inte fortsatter for fel anvandare.

## Forvantat

- Ingen cross-user data.
- Ingen tyst konfliktforlust.
- Ingen dubbelnotis.
- Ingen full deviceId eller ra payload i UI.
- Backup/restore paverkar inte auth-sessionen.
