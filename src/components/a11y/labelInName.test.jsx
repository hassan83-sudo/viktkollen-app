/* @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.js'
import { duplicateLandmarks, labelInNameViolations } from '../../test/a11y/names.js'
import { moreHubFolders } from '../../services/more/moreFolders.js'
import BottomNavigation from '../app/BottomNavigation.jsx'
import OverviewDashboard from '../app/OverviewDashboard.jsx'
import MoreHub from '../more/MoreHub.jsx'

// A11Y-8G: WCAG 2.5.3 Label in Name and unique landmarks.

// Body Scan is out of the accessibility sprints' scope (owned elsewhere);
// its Home card keeps its existing label. Documented in TESTING.md.
const bodyScanCard = '.overview-primary-action.is-body .overview-primary-action-hit'

function renderHome() {
  return render(
    <OverviewDashboard
      adaptiveCoachFeedback={{}}
      calorieGoal={2200}
      caloriesToday={1840}
      checkIn={{ steps: 13956 }}
      currentWeight={78.4}
      featureFlags={{ socialUi: true, socialLive: false }}
      foods={[]}
      goalsHabits={{}}
      healthScore={81}
      healthSnapshot={{ date: '2026-08-11', weight: { current: 78.4, dailyWeights: [] } }}
      isAuthenticated
      meals={[]}
      nutritionGoals={{ calories: 2200, protein: 135 }}
      onAddMeal={vi.fn()}
      onEditProfile={vi.fn()}
      onLogWeight={vi.fn()}
      onNavigateSection={vi.fn()}
      onScanFood={vi.fn()}
      profile={{ name: 'Test Person', goalWeight: 74 }}
      proteinGoal={135}
      proteinToday={112}
      reminderState={{ reminders: [] }}
      selectedDate="2026-08-11"
      syncStatus={{}}
      weights={[]}
    />,
  )
}

describe('label in name and landmarks (A11Y-8G)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
  })

  describe('bottom navigation', () => {
    it.each(['sv', 'en'])('names every link by its visible label (%s)', async (language) => {
      await i18n.changeLanguage(language)
      render(<BottomNavigation activeSection="home" onSectionChange={vi.fn()} />)
      const links = within(screen.getByRole('navigation')).getAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(5)
      links.forEach((link) => {
        const label = link.querySelector('strong').textContent
        expect(link.getAttribute('aria-label')).toBeNull()
        expect(within(screen.getByRole('navigation')).getByRole('link', { name: label })).toBe(link)
      })
      expect(labelInNameViolations(document.body)).toEqual([])
    })

    it('Hem and Mer are reachable by the words on screen', () => {
      render(<BottomNavigation activeSection="more" onSectionChange={vi.fn()} />)
      expect(screen.getByRole('link', { name: 'Hem' }).getAttribute('href')).toBe('#app-section-home')
      expect(screen.getByRole('link', { name: 'Mer' }).getAttribute('aria-current')).toBe('page')
    })
  })

  describe('Mer folder buttons', () => {
    it('name each folder by its visible title followed by its description', () => {
      render(<MoreHub isAuthenticated syncStatus={{ online: true, statusCode: 'synced', statusLabel: 'Synkad' }} onOpen={vi.fn()} />)
      const folders = screen.getByRole('navigation', { name: /kategorier/i })
      moreHubFolders.forEach((folder) => {
        const button = within(folders).getByRole('button', { name: `${folder.title} ${folder.description}` })
        expect(button.getAttribute('aria-label')).toBeNull()
      })
      expect(labelInNameViolations(document.body)).toEqual([])
    })
  })

  describe('Home cards', () => {
    it('names the Dagens läge cards and primary actions by their visible text', () => {
      renderHome()
      ;[
        /^Må bra .*Öppna Må bra$/,
        /^AI Coach Fråga din coach .*Öppna Coach$/,
        /^Nästa påminnelse /,
        /^Notis /,
        /AI Ögon Minne, kläder och sista kollen Tryck på bilden$/,
        /Matscanning Skanna maten och uppskatta näringen Tryck på bilden$/,
      ].forEach((name) => expect(screen.getByRole('button', { name })).toBeTruthy())
    })

    it('has no control whose explicit name leaves out its visible label', () => {
      renderHome()
      expect(labelInNameViolations(document.body, { exclude: [bodyScanCard] })).toEqual([])
    })

    it('names the Viktkollen Live play/pause control without a conflicting visible glyph', () => {
      renderHome()
      const playback = screen.getByRole('button', { name: /Viktkollen Live$/ })
      expect(playback.textContent.trim()).toBe('')
      expect(playback.querySelector('[aria-hidden="true"][data-glyph]')).not.toBeNull()
    })
  })

  describe('Home landmarks', () => {
    it('has no two landmarks with the same role and name', () => {
      renderHome()
      expect(duplicateLandmarks(document.body)).toEqual([])
    })

    it('keeps Dagens läge and Viktkollen Live as exactly one named region each', () => {
      renderHome()
      expect(screen.getAllByRole('region', { name: 'Dagens läge' })).toHaveLength(1)
      expect(screen.getAllByRole('region', { name: 'Viktkollen Live' })).toHaveLength(1)
      // Dagens läge reuses its visible heading.
      const today = screen.getByRole('region', { name: 'Dagens läge' })
      expect(today.getAttribute('aria-labelledby')).toBe('overview-today-title')
      expect(within(today).getByRole('heading', { name: 'Dagens läge' })).toBeTruthy()
    })
  })
})
