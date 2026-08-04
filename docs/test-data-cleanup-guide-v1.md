# Test Data Cleanup Guide V1

## Marker

All fixturedata ska innehalla:

- `TESTDATA_RELEASE_ACCEPTANCE_V1`
- `TESTDATA` i namn eller anteckning nar det ar anvandartext

## Saker cleanup

1. Forhandsgranska antal objekt.
2. Bekrafta cleanup explicit.
3. Rensa endast markerad TESTDATA.
4. Kontrollera efterat att vanlig anvandardata finns kvar.

## Far aldrig rensas automatiskt

- omarkerad viktdata
- omarkerade maltider
- auth/sessioner
- Supabase credentials
- annan anvandares data

## Rollback

Vid repository-mutation ska snapshot tas fore cleanup. Om cleanup misslyckas, aterstall snapshoten eller avbryt och dokumentera blockeraren i ManualAcceptanceRunner.
