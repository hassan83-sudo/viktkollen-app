# A11Y-5C Hearing and visual alerts

## Scoped audio audit

The Accessibility hub and Communication view have no local timer, alarm, beep, notification, or
other app-generated audio cue. Their only known audio behavior is browser SpeechSynthesis for
manual read-aloud and the opt-in navigation read-aloud from A11Y-5B. No timer or alert caption was
invented because no local cue with known semantics exists in this scope.

## Visual alternatives and live regions

Known speech lifecycle cues use the reusable `AccessibilityFeedback` pattern: visible text plus an
atomic `role="status"` polite live region. It represents `Läser upp`, `Stoppad`, `Klar`, browser
support errors, and applicable read-aloud errors without requiring TTS, device sound, or volume.
Repeated same status values are deduplicated by state and do not create additional live regions.

Success, warning, and error each include text and a border/background treatment; no important
state depends on color or an icon. The component has no animation, remains visible in high contrast
and large text modes, and follows the existing one-column 390/430px layout. Existing reduced-motion
rules therefore require no separate visual pulse or animation.

## Privacy and communication

No hearing, medical, or disability profile is collected. No microphone, recording, speech
recognition/STT, external AI, external provider, or Supabase request is introduced. Text
communication remains the local phrase and custom-text foundation from A11Y-5A; it is not a full
AAC system. The custom text value remains excluded from automatic focus narration.

The A11Y-5B navigation-speech opt-in remains independent: when it is off, manual speech feedback
and browser-support errors still have visible text. Native controls, labels, focus order, and
polite live regions remain available to screen readers.

## Remaining A11Y-5D scope

A11Y-5D may audit other app surfaces individually for known audio cues. It must not create
captions for unknown audio or weaken the local, text-first feedback foundation documented here.
