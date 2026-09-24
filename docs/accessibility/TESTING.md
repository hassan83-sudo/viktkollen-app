# Accessibility testing (A11Y-8F)

Viktkollen has two automated accessibility layers. Both are local, use only
open-source tools and need no account, backend or paid service.

| Command | What it runs | Time |
| --- | --- | --- |
| `npm run test:a11y` | Vitest (jsdom): component, focus, name and axe tests | ~30 s |
| `npm run test:a11y:e2e` | Playwright (Chromium): the running app, keyboard, axe, zoom, motion | ~3 min |

Both are also part of the normal suites where they belong. The Vitest files are
included in `npm test`. The Playwright suite is separate, and `npm test` never
starts a browser.

## Levels

1. **Vitest + Testing Library** (`src/**/*.test.jsx`). These cover component
   behaviour: dialogs (8C), forms and voice (8D), walkie-talkie, the alarm and
   navigation (8E), focus return, and names found by role.
2. **axe in jsdom** (`src/test/a11y/axe.js`, used by
   `src/components/a11y/automatedAxe.test.jsx`). This checks ARIA, names,
   labels, roles and dialog naming on rendered components. jsdom cannot compute
   colours, so colour contrast is checked in the browser suite instead.
3. **Playwright + axe in Chromium** (`tests/a11y/*.spec.js`,
   `playwright.a11y.config.js`). These run the real app:
   - `axe-views.spec.js`: Hem, Mer, Tillgänglighet and the AI Coach dialog in
     default, high-contrast and large text/controls modes; Tal & kommunikation,
     and the Social, Ready and Place dialogs.
   - `keyboard.spec.js`: skip link, navigation and focus to the heading, the AI
     Coach dialog (trap, inert background, Escape, focus return), Tal &
     kommunikation (Läs upp/Stoppa) and the walkie-talkie without a mouse.
   - `alarm.spec.js`: the visual wake alarm, triggered with a fake clock and
     silent speech, in all three modes.
   - `zoom-reflow.spec.js`: 200 % zoom (640×400 at DPR 2) and 320 px reflow.
     Checks for no horizontal scroll, that navigation is visible and that every
     dialog control can be reached.
   - `reduced-motion.spec.js`: the OS `prefers-reduced-motion` setting and the
     app's own setting, plus a control case that proves the detector works.
   - `landmarks.spec.js`: one exposed `main`, one `h1` per view, a valid skip
     link target, and named modal dialogs.
   - `high-contrast.spec.js`: resolved high-contrast tokens (7:1 and 4.5:1) and a
     visible focus outline (at least 2px and 3:1).
4. **Numeric contrast tests** for the 8B tokens
   (`src/services/accessibility*.test.*`). They remain the source of truth for
   the declared token values.

axe blocks on **critical** and **serious** findings. Moderate and minor findings
are attached to the Playwright report (`axe-<view>.json` and a test annotation)
but do not fail the run. No axe rule is disabled and nothing is excluded. If an
exclusion is ever needed, it must be one narrow selector, with the reason and
the owner written next to it.

## What is mocked

- **Supabase:** the dev server runs with a local, never-started project URL
  (`http://127.0.0.1:54321`). A fake signed-in session is seeded in
  `localStorage`, and every Supabase request is aborted. The walkie-talkie spec
  answers only the two call tables with an accepted call.
- **Speech:** `speechSynthesis` is a silent stub that records what would have
  been spoken (`window.__a11ySpokenTexts`). `navigator.vibrate` is a no-op.
- **Microphone:** Chromium's fake device and fake permission UI.
- **Time:** `page.clock` in Playwright, and `vi.useFakeTimers` in Vitest.
- **Walkie-talkie:** it needs a real accepted family call, so the spec mounts the
  real `PlaceVoiceCallPanel` through `tests/a11y/fixtures/walkieHarness.js`.
  That fixture is loaded by the dev server and is not part of the app bundle.

## Running locally and in CI

```sh
npm run test:a11y
npm run test:a11y:e2e            # starts its own Vite dev server on :5174
```

- `A11Y_CHROMIUM_EXECUTABLE=/path/to/chromium` uses a preinstalled Chromium
  instead of the revision Playwright pins. Otherwise run
  `npx playwright install chromium` once.
- `A11Y_E2E_PORT` changes the dev-server port.
- Reduced motion is emulated with `page.emulateMedia`, because some
  preinstalled Chromium revisions ignore the `reducedMotion` context option.

For CI, a later step only needs Node, `npm ci`,
`npx playwright install --with-deps chromium`, and the two commands above. The
suite runs with one worker, no retries and a deterministic clock and data. It
is not wired into any workflow yet.

## Adding a test for a new dialog or form

1. **Component (Vitest):** render it, find controls by role and name
   (`screen.getByRole('button', { name: 'Spara' })`), and add
   `await expectNoBlockingViolations()` in `automatedAxe.test.jsx`. For a
   dialog, use `ModalDialog` or `useDialogA11y` and assert: named `dialog`,
   `aria-modal="true"`, focus inside, Tab and Shift+Tab stay inside, Escape (if
   allowed), and focus return. The helpers are in `src/test/a11y/focus.js`.
2. **Browser (Playwright):** open it with the keyboard in
   `tests/a11y/keyboard.spec.js`. Use the helpers in `tests/a11y/support/`:
   `openApp`, `goToSection`, `expectNoBlockingAxeViolations`,
   `expectFocusInside`, `expectTabTrappedIn`, `expectBackgroundInert` and
   `expectFocusNotOnBody`.
3. **Prove the test works:** temporarily break the feature (remove the label,
   the dialog name or the focus return), confirm that the test fails, and then
   restore it.

## Known limitations (8F)

- Body Scan, Smart Camera, billing and account deletion are out of scope. They
  have no dedicated scans, although whatever of them is visible on Hem is part
  of the Hem scan.
- The walkie-talkie is tested through a fixture, not in a real two-device call.
- Speech and alarm audio are never played. Only the text and visual paths are
  verified.
- axe's experimental `label-content-name-mismatch` rule (WCAG 2.5.3) is not
  part of the gate. It currently reports that the accessible names of Hem
  cards, Mer folders and the bottom navigation do not contain the visible label
  word (for example, visible "Hem" but the name "Öppna översikten"). This is
  follow-up work.
- `landmark-unique` (moderate) on Hem: two regions share a name.
