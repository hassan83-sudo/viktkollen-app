# SÖK-2 — Visible and global search

Branch: `search-navigation-sprint1` (continues SÖK-1 `6c8d859`). Search index and destinations were not rebuilt.

## Where search is mounted

A single **host** `GlobalSearch` is mounted in the authenticated `app-shell` in `App.jsx` (after `ReminderBanner`):

- `listenForShortcut`
- `showTrigger={false}`
- `onNavigate={handleGlobalSearchNavigate}` (same SÖK-1 destination helper)

It is **not** mounted on login (`AuthPanel`) or onboarding.

Triggers do not own a dialog. They dispatch `viktkollen:open-global-search`.

## Visible trigger

| Place | Behavior |
|---|---|
| Hem / OverviewDashboard, compact row under the header | Button `⌕ Sök` (shortcut hint `Ctrl K` on wide screens) |
| Mer → Inställningar → Sök i appen | Same trigger; opens the host dialog |

## Global shortcut

Windows/Linux: **Ctrl+K**. macOS: **Cmd+K**.

Only the host registers `window` `keydown`. If the dialog is already open, the event is swallowed (no second overlay). Shortcuts are ignored in `input` / `textarea` / `select` / `contenteditable`.

## Focus

Open: focus moves to the search field. Escape or Close restores focus to the opener (or previous `document.activeElement`). Results are a `listbox` of `option` buttons; arrows + Enter navigate.

## Mobile (390 / 430)

Home trigger is a compact 44px-tall button. Shortcut `<kbd>` is hidden in the existing compact media query. Dialog is `width: min(640px, 100%)` with scrollable results and a full-width close control. Search row uses `overflow-x: hidden`.

## More / Inställningar

Still labeled “Sök i appen”. The instance is trigger-only (`listenForShortcut` default false) so it does not compete with the host listener.

## Privacy / recent searches

Unchanged: localStorage `viktkollen.globalSearch.recentIds`, no network, no analytics.

## Tests

Focused run: **38 passed** (GlobalSearch, events, index/gating, OverviewDashboard Home trigger, App.releasePolish).

- GlobalSearch interactions: Ctrl+K, Cmd+K, Escape, single dialog, textarea safety, focus to input and back to trigger
- layout CSS checks for compact Home + dialog (390/430: 100% width, 44px min-height, kbd hidden, overflow-x hidden)
- OverviewDashboard includes the Home trigger
- App.releasePolish: no `<AppTopbar`, host `listenForShortcut`, More has trigger without `listenForShortcut`
- SÖK-1 `globalSearchIndex` destinations and feature flags (`socialUi`, `reminderHubUi`, `smartCamera`)

`i18n:check`: passed. `npm run build`: passed. `git diff --check`: passed.

## Lint

`eslint` on changed SÖK-2 files: clean.

Pre-existing (not introduced here): `App.jsx` React Compiler `preserve-manual-memoization` cascade around `handleDailyCoachAction` / `Date.now` when the whole file is linted. Build still succeeds.

## Remaining limits

- Home trigger is compact; there is no persistent search field.
- Shortcut hint is Windows-oriented (`Ctrl K`); Cmd is still bound.
- Focus return uses `requestAnimationFrame`; nested overlays can steal it.
- Viewport checks for 390/430 are CSS + layout tests, not a live device farm.
