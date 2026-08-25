export const walkieFeature = Object.freeze({
  id: 'walkieTalkie',
  enabledByDefault: false,
  hiddenWhenDisabled: true,
  continuousListeningForbiddenUnlessExplicit: true,
  requires: [
    'explicit-activation',
    'permanent-microphone-indicator',
    'visible-who-can-hear',
    'immediate-stop',
    'WebRTC-or-voice-backend',
  ],
  emptyState: 'Walkie-talkie är inte aktivt. Ingen dold mikrofon används.',
})
