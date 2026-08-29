import { describe, expect, it } from 'vitest'
import {
  animalWorldMediaSeeds,
  canDisplayAsVerifiedMedia,
  communicationPreferences,
  educationSectionIds,
  getMediaDisclosureKey,
  getSignLanguageCapabilityState,
  normalizeCompanionCommunicationPreferences,
  pregnancyMediaSeeds,
  signLanguageOptions,
  signPhraseSeeds,
} from './learningMediaModel.js'

describe('learningMediaModel', () => {
  it('keeps the three education sections as stable Mer route IDs', () => {
    expect(educationSectionIds).toEqual(['sign-language', 'animal-world', 'pregnancy-first-year'])
  })

  it('puts STS first and keeps ASL, BSL and International Sign separate future languages', () => {
    expect(signLanguageOptions.map((language) => language.id)).toEqual(['sts', 'asl', 'bsl', 'international-sign'])
    expect(signLanguageOptions[0].status).toBe('primary')
    expect(signLanguageOptions.filter((language) => language.status.startsWith('future')).map((language) => language.id)).toEqual(['asl', 'bsl', 'international-sign'])
  })

  it('normalizes companion communication preferences safely', () => {
    expect(communicationPreferences).toEqual(['text', 'visual', 'text-and-verified-sign'])
    expect(normalizeCompanionCommunicationPreferences({
      communicationPreference: 'text-and-verified-sign',
      prefersSpeech: true,
      selectedSignLanguage: 'bsl',
    })).toEqual({
      communicationPreference: 'text-and-verified-sign',
      prefersSpeech: true,
      selectedSignLanguage: 'bsl',
    })
    expect(normalizeCompanionCommunicationPreferences({
      communicationPreference: 'auto-translate-everything',
      selectedSignLanguage: 'mixed',
    })).toMatchObject({ communicationPreference: 'text', selectedSignLanguage: 'sts' })
  })

  it('only treats textSvar as working before verified sign material exists', () => {
    expect(getSignLanguageCapabilityState()).toEqual({
      humanReviewed: false,
      selectedSignLanguage: true,
      signInputRecognition: false,
      textSvar: true,
      verifiedSignAvatar: false,
      verifiedSignVideo: false,
    })
  })

  it('does not display unreviewed or missing media as verified', () => {
    expect(animalWorldMediaSeeds.every((item) => !canDisplayAsVerifiedMedia(item))).toBe(true)
    expect(pregnancyMediaSeeds.every((item) => !canDisplayAsVerifiedMedia(item))).toBe(true)
    expect(canDisplayAsVerifiedMedia({
      assetId: 'verified-asset',
      humanReviewed: true,
      mediaType: 'video',
      section: 'animal-world',
      status: 'verified',
    })).toBe(true)
  })

  it('marks AI nature and pregnancy media with different disclosures', () => {
    expect(getMediaDisclosureKey(animalWorldMediaSeeds.find((item) => item.aiGenerated))).toBe('media.disclosure.aiNature')
    expect(getMediaDisclosureKey(pregnancyMediaSeeds.find((item) => item.aiGenerated))).toBe('media.disclosure.aiMedical')
  })

  it('prepares common phrases without fake videos or mixed sign languages', () => {
    expect(signPhraseSeeds).toHaveLength(10)
    expect(new Set(signPhraseSeeds.map((phrase) => phrase.signLanguage))).toEqual(new Set(['sts']))
    expect(signPhraseSeeds.every((phrase) => !phrase.videoAssetId && phrase.reviewStatus === 'needs-review')).toBe(true)
  })
})
