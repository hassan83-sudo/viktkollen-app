let aiApiModule
let aiCoachAppContextModule
let aiConversationMemoryModule
let aiDeterministicModule
let aiSuggestionsModule
let aiUserContextModule
let aiCoachV2Module
let proactiveCoachModule
let weeklyReportModule

export async function loadAiApiService() {
  aiApiModule ||= import('../aiApiService.js')
  return aiApiModule
}

export async function loadAiCoachAppContext() {
  aiCoachAppContextModule ||= import('../aiCoach/coachAppContext.js')
  return aiCoachAppContextModule
}

export async function loadAiConversationMemory() {
  aiConversationMemoryModule ||= import('../aiConversationMemory.js')
  return aiConversationMemoryModule
}

export async function loadAiDeterministicReplies() {
  aiDeterministicModule ||= import('../aiCoachDeterministicReplies.js')
  return aiDeterministicModule
}

export async function loadAiSuggestions() {
  aiSuggestionsModule ||= import('../aiSuggestions.js')
  return aiSuggestionsModule
}

export async function loadAiUserContext() {
  aiUserContextModule ||= import('../aiUserContext.js')
  return aiUserContextModule
}

export async function loadAiCoachV2Service() {
  aiCoachV2Module ||= import('../aiCoachV2Service.js')
  return aiCoachV2Module
}

export async function loadProactiveCoachService() {
  proactiveCoachModule ||= import('../proactiveCoachService.js')
  return proactiveCoachModule
}

export async function loadWeeklyReportService() {
  weeklyReportModule ||= import('../weeklyReportService.js')
  return weeklyReportModule
}
