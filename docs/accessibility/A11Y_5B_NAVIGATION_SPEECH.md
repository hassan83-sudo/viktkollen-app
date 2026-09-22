# A11Y-5B Navigation speech

This opt-in feature takes inspiration from concise console-style (PS5-like) focus feedback while
preserving normal web and assistive-technology behavior. It uses only the browser's native
`SpeechSynthesis` API: no external TTS provider, microphone, recording, analytics, or server call.

## Behavior and privacy

- **Off by default:** `Navigationsuppläsning` is stored only in the existing namespaced local
  accessibility preference. It reads keyboard focus inside the accessibility hub and its details,
  never hover, touch, or pointer focus.
- **Screen readers:** semantic HTML, ARIA, and native focus order remain the primary experience.
  The feature is deliberately opt-in because a web app cannot reliably detect every VoiceOver,
  NVDA, or other screen-reader configuration.
- **Labels:** short speech uses `data-a11y-speech-label`, then `aria-label`, resolved
  `aria-labelledby`, meaningful visible text, and finally a generic control label. State is added
  only when useful (for example pressed, expanded, selected, checked, or disabled).
- **Privacy:** input values, password values, custom communication text, health information,
  notes, IDs, URLs, and hidden content are never included in automatic focus speech. Inputs announce
  their label and type only.

## Speech controls

The active application language selects a safe browser locale fallback; Swedish uses `sv-SE` and
English uses `en-US`. The bounded local rate choices are **Långsam**, **Normal**, and **Snabb**.
Repeated focus is deduplicated briefly, rapid focus cancels queued speech before the latest target,
and the hub cancels speech when it closes or unmounts. Calm polite status messages report
`Läser upp`, `Stoppad`, or `Klar`.

The existing manual **Läs upp** and **Stoppa** communication actions reuse the same browser speech
engine. Keyboard behavior, visible focus, high contrast, reduced motion, and the 390/430px
responsive layout remain unchanged.

## Remaining A11Y-5C scope

A11Y-5C can evaluate additional accessibility surfaces, but must keep navigation speech opt-in,
local, bounded, and non-invasive for screen-reader users.
