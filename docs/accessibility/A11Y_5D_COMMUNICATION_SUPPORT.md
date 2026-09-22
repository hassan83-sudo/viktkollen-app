# A11Y-5D Communication support

## Built locally

The existing A11Y communication detail remains a local text-first tool. It provides the editable
**Säg detta åt mig** field and short quick phrases including yes/no/thanks, wait, help, write
instead, pause, contact wording, and “I cannot speak right now.” Choosing a phrase inserts it in
the field; it never speaks, dials, messages, or sends anything automatically.

The existing **Läs upp** and **Stoppa** controls continue to use the shared browser
SpeechSynthesis foundation. Visible polite status feedback remains available when speech starts,
stops, completes, or is unavailable, so communication is usable muted or with TTS off. Navigation
speech remains opt-in and uses the same cancellation path, avoiding a second speech engine.

The inline large-message view presents the current local message with high readability and safe
long-word wrapping. It is not a modal; its native close control returns focus to the trigger.
Existing keyboard controls, visible focus, high contrast, large-text scaling, reduced-motion
rules, and responsive 390/430px single-column layout apply.

## Privacy and screen readers

Message text and selected phrases stay in React component state only. They are not written to
browser storage or preferences, sent to a server, logged, analysed, or included in documentation
as a user payload. No medical profile, microphone, recording, speech recognition/STT, external
TTS, external AI, calls, messaging, or SOS capability is present.

Native buttons, labels, textarea semantics, focus order, and sparing polite status regions remain
available to screen readers. This is communication support, not a full AAC system: it has no
saved phrase boards, contacts, image symbols, language modelling, or emergency communication.

## Recommended A11Y-5E assessment

Assess motorik and rörelsehinder support across individual interaction surfaces before implementing
anything. Do not expand this communication feature during that assessment.
