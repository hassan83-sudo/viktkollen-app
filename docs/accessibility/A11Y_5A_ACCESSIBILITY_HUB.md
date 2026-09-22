# A11Y-5A Accessibility and assistive tools hub

The accessibility hub had been absent from the main-based worktree. It is restored from
`a11y4-review-windows` at `64ad0660571fa714a6f50eba57e8f9254cf9a71d`, the verified source
commit for A11Y-4’s visible speech-status feedback.

## Restored scope

- **Mer integration:** `Tillgänglighet & hjälpmedel` opens the `accessibility` More folder and
  renders `AccessibilityHub`; the existing `65+ · Min vardag` folder remains a separate path.
- **Hub and communication:** the hub includes vision, hearing, speech and communication, motor,
  reading, cognitive support, simple mode, and older-adult assistance. Communication includes
  local phrase selection, custom text, SpeechSynthesis read-aloud, visible live status, and
  explicit stop behavior through `stopSpeakingWithStatus`.
- **Assistive foundation:** native buttons, headings, fieldset legends, pressed states, status
  announcements, Escape for large text, focus styling, and responsive one-column layouts at
  390px and 430px are preserved from the source implementation.
- **Privacy:** preferences are limited to a namespaced local browser setting. Text and speech are
  local; no diagnosis, Supabase mutation, or other sensitive storage is added.
- **Translations:** required `accessibility.*` Swedish and English strings are restored, with
  other languages inheriting the English translation base.

## Remaining A11Y-5B scope

A11Y-5B may extend accessibility behavior beyond this contained More hub. It must not fold the
standalone 65+ experience into this hub or change the local privacy boundary established here.
