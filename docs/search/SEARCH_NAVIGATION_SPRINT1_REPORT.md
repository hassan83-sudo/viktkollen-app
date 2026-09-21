# SÖK-1 — Global search navigation

Branch: `search-navigation-sprint1` from `origin/main` (`c8899a5`).

UI was not moved. Ctrl/Cmd+K remains mounted only in Mer → Inställningar. Legacy `AppTopbar` was not restored.

## Old index posts (kept, destinations checked)

| id | Change |
|---|---|
| home-dashboard | `hem` → `app-section-home` (legacy topbar id is unused) |
| weight-progress | still `vikt` → More folder `mal-framsteg` → ProgressHub `weight` |
| progress-insights / photos / body-scan / reports | still Progress under Mer, mapped via `moreHubTargetFolders` |
| meals | still `maltider`; **mapping added** `maltider` → `mat` |
| nutrition-dashboard | mapping `nutrition-view-panel` → `mat` |
| nutrition-coach | mapping `nutrition-coach-center` → `ai-coach` |
| meal-planner | **section `nutrition` → `home`** (`#meal-planner` lives on OverviewDashboard) |
| weekly-meal-planner / recipes / scanner / daily-checkin | mappings to `mat` |
| ai-coach | `chat` → folder `ai-coach` (mapping `chat` → `ai-coach` kept for deep scroll) |
| wellbeing / economy / education / backup / import / export / settings | verified against More hub |

## New index posts

- Redo! → `redo` / `app-section-redo`
- Plats → `place` / `app-section-place`
- Min resa → `journey` / `app-section-journey`
- Stället → `social` / `app-section-social` (`socialUi`)
- Notiser → `notices` / `app-section-notices` (`reminderHubUi`)
- Aktivitet → More `aktivitet`
- 65+ · Min vardag → `senior-65-plus`
- Inkasso → `inkasso`
- Kronofogden → `kronofogden`
- Arkiv & Historik → `arkiv-historik`
- Smart kamera / AI Ögat → home + `homeIntent.mode = forgotten` (`smartCamera`)
- Språk → `language-settings` inside Inställningar (`id` added on `LanguageSettingsPanel`)

Tillgänglighet & hjälpmedel **not** added (not on this main). Sprint 12A-specific ear search **not** added; opening Smart kamera uses existing home overlay.

## Removed dead posts

- `notification-center` — `NotificationCenter` is not mounted; NoticeHub is the live notices UI
- `reminders` — `ReminderCenter` is not mounted; replaced by `notices`

## More-folder mappings added

`maltider`, `checkin`, `nutrition-view-panel`, `weekly-meal-planner-title`, `recipe-manager-title`, `chat`, `nutrition-coach-center`, `language-settings` (+ `language` / `sprak` / `språk`)

## Feature gating

`getVisibleGlobalSearchItems()` + `resolveGlobalSearchDestination()` use `featureRegistry`:

- `socialUi` → Stället
- `reminderHubUi` → Notiser
- `smartCamera` → Smart kamera / AI Ögat

## Tests / build

- `globalSearchIndex.test.js` — unique IDs, destinations, gating
- `moreFolders.test.js` — current hub list + new mappings
- `GlobalSearch.interaction.test.jsx` — trigger, dialog, type, Enter, Escape
- `GlobalSearch.test.jsx` — existing trigger markup
- `App.releasePolish.test.js` — no `<AppTopbar`, still `<GlobalSearch` in More

## Remaining for SÖK-2

- Move GlobalSearch out of Inställningar (Hem / More hub / shell)
- Make Ctrl/Cmd+K global (mount search outside More)
- Optional: i18n for remaining legacy Swedish index titles
- Nested ProgressHub: `vikt` opens the weight folder via intent; there is still no DOM `#vikt`
- Bottom nav still has no Notis tab; search uses `activeAppSection === 'notices'`
