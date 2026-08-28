export const readyAvatars = Object.freeze([
  { id: 'nova', accent: 'cyan', labelKey: 'avatars.nova', personalities: ['calm', 'cheerful'] },
  { id: 'kai', accent: 'purple', labelKey: 'avatars.kai', personalities: ['direct', 'study'] },
  { id: 'mira', accent: 'blue', labelKey: 'avatars.mira', personalities: ['cheerful', 'funny'] },
  { id: 'sol', accent: 'gold', labelKey: 'avatars.sol', personalities: ['calm', 'study'] },
  { id: 'rio', accent: 'magenta', labelKey: 'avatars.rio', personalities: ['funny', 'direct'] },
  { id: 'ash', accent: 'teal', labelKey: 'avatars.ash', personalities: ['calm', 'direct'], aid: 'hearing' },
  { id: 'quill', accent: 'violet', labelKey: 'avatars.quill', personalities: ['study', 'calm'], aid: 'mobility' },
  { id: 'zen', accent: 'indigo', labelKey: 'avatars.zen', personalities: ['calm', 'cheerful'] },
])

export const readyPersonalities = Object.freeze([
  'calm',
  'cheerful',
  'direct',
  'funny',
  'study',
])

export function getReadyAvatars() {
  return [...readyAvatars]
}

export function getReadyAvatar(id) {
  return readyAvatars.find((avatar) => avatar.id === id) || readyAvatars[0]
}
