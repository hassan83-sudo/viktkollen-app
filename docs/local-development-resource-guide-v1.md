# Local Development Resource Guide V1

## Syfte

Den här guiden hjälper vid långa lokala Codex-/PowerShell-körningar där Node, Vite eller Playwright kan lämna processer efter sig.

## Kontrollera Processer

```powershell
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime,CPU
Get-Process chrome,chromium,msedge -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime,CPU
```

## Kontrollera Lyssnande Lokala Portar

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 5173 -and $_.LocalPort -le 5205 } | Select-Object LocalAddress,LocalPort,OwningProcess
```

## Rensa Testartefakter

```powershell
Remove-Item -LiteralPath .\playwright-report -Recurse -Force
Remove-Item -LiteralPath .\test-results -Recurse -Force
```

Kontrollera alltid att sökvägen ligger i projektmappen innan du raderar rekursivt.

## Testkommandon

- `npm test -- --run` kör Vitest en gång utan watch.
- `npm run test:e2e` kör Playwright smoke.
- `npm run verify:release` kör full release-gate, inklusive två unit-testkörningar, lint, build, e2e och diff-check.

För snabb lokal feedback kan riktade Vitest-filer köras, men releasebeslut ska fortfarande använda full gate.

## Kända Belastningskällor

- `verify:release` kör unit tests två gånger avsiktligt för release-stabilitet.
- Playwright skapar tillfälliga rapporter och traces vid fel.
- Production build skriver om `dist`.

## Efter Lång Körning

1. Kontrollera Node/Chromium-processer.
2. Rensa `playwright-report` och `test-results` om de bara är lokala artefakter.
3. Kör `git status --short --untracked-files=all`.
4. Kontrollera att inga screenshots, traces eller profiler ligger kvar av misstag.
