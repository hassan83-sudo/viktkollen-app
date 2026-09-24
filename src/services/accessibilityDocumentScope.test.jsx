/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { createPortal } from 'react-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.js'
import AccessibilitySetup from '../components/more/AccessibilitySetup.jsx'
import {
  getEffectiveAccessibilityPreferences,
  resetAccessibilityPreferences,
  saveAccessibilityPreferences,
  useAccessibilityPreferences,
} from './accessibilityPreferences.js'
import {
  accessibilityDocumentAttributes,
  applyAccessibilityDocumentScope,
  clearAccessibilityDocumentScope,
  getAccessibilityScrollBehavior,
  prefersReducedAccessibilityMotion,
  useAccessibilityDocumentScope,
} from './accessibilityDocumentScope.js'

const accessibilityCss = readFileSync(resolve(process.cwd(), 'src', 'styles', 'accessibility.css'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src', 'App.css'), 'utf8')
const mainSource = readFileSync(resolve(process.cwd(), 'src', 'main.jsx'), 'utf8')

const html = () => document.documentElement
const ownedAttributes = Object.values(accessibilityDocumentAttributes)

// Mirrors the App root wiring: live store -> effective preferences -> <html>.
function GlobalScopeHarness({ children }) {
  const preferences = useAccessibilityPreferences()
  useAccessibilityDocumentScope(getEffectiveAccessibilityPreferences(preferences))
  return children ?? null
}

function PortalContent() {
  return createPortal(<div data-testid="portal-dialog" role="dialog" aria-label="Portal">Portal</div>, document.body)
}

function mockReducedMotionMedia(matches) {
  window.matchMedia = vi.fn((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe('global accessibility document scope (A11Y-8B)', () => {
  let originalMatchMedia

  beforeEach(async () => {
    window.localStorage.clear()
    clearAccessibilityDocumentScope()
    originalMatchMedia = window.matchMedia
    await i18n.changeLanguage('sv')
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    clearAccessibilityDocumentScope()
    window.matchMedia = originalMatchMedia
  })

  describe('global scope on <html>', () => {
    it('exposes the default (normal) state on <html> without enabled flags', () => {
      render(<GlobalScopeHarness />)

      expect(html().getAttribute('data-a11y-text-size')).toBe('normal')
      ;['data-a11y-high-contrast', 'data-a11y-large-controls', 'data-a11y-line-spacing', 'data-a11y-reduced-motion'].forEach((attribute) => {
        expect(html().hasAttribute(attribute)).toBe(false)
      })
    })

    it('applies stored preferences to <html> on mount', () => {
      saveAccessibilityPreferences({ textSize: 'large', highContrast: true, largeControls: true, lineSpacing: true, reduceMotion: true })
      render(<GlobalScopeHarness />)

      expect(html().getAttribute('data-a11y-text-size')).toBe('large')
      expect(html().getAttribute('data-a11y-high-contrast')).toBe('true')
      expect(html().getAttribute('data-a11y-large-controls')).toBe('true')
      expect(html().getAttribute('data-a11y-line-spacing')).toBe('true')
      expect(html().getAttribute('data-a11y-reduced-motion')).toBe('true')
    })

    it('updates <html> immediately when a preference changes elsewhere', () => {
      render(<GlobalScopeHarness />)

      act(() => {
        saveAccessibilityPreferences({ textSize: 'extra-large', highContrast: true })
      })
      expect(html().getAttribute('data-a11y-text-size')).toBe('extra-large')
      expect(html().getAttribute('data-a11y-high-contrast')).toBe('true')

      act(() => {
        saveAccessibilityPreferences({ textSize: 'extra-large', highContrast: false })
      })
      expect(html().hasAttribute('data-a11y-high-contrast')).toBe(false)
    })

    it('updates <html> from the real shared setup controls', () => {
      render(
        <GlobalScopeHarness>
          <AccessibilitySetup onFinish={vi.fn()} />
        </GlobalScopeHarness>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Tydligare kontrast' }))
      fireEvent.click(screen.getByRole('button', { name: 'Minska animationer' }))
      fireEvent.click(screen.getByRole('button', { name: 'Stor text' }))

      expect(html().getAttribute('data-a11y-high-contrast')).toBe('true')
      expect(html().getAttribute('data-a11y-reduced-motion')).toBe('true')
      expect(html().getAttribute('data-a11y-text-size')).toBe('large')
    })

    it('resets <html> to the default state when preferences are reset', () => {
      saveAccessibilityPreferences({ textSize: 'large', highContrast: true, largeControls: true, lineSpacing: true, reduceMotion: true })
      render(<GlobalScopeHarness />)

      act(() => {
        resetAccessibilityPreferences()
      })

      expect(html().getAttribute('data-a11y-text-size')).toBe('normal')
      ;['data-a11y-high-contrast', 'data-a11y-large-controls', 'data-a11y-line-spacing', 'data-a11y-reduced-motion'].forEach((attribute) => {
        expect(html().hasAttribute(attribute)).toBe(false)
      })
    })

    it('applies the senior package as extra-large text plus every bundled flag', () => {
      saveAccessibilityPreferences({ seniorMode: true })
      render(<GlobalScopeHarness />)

      expect(html().getAttribute('data-a11y-text-size')).toBe('extra-large')
      expect(html().getAttribute('data-a11y-high-contrast')).toBe('true')
      expect(html().getAttribute('data-a11y-large-controls')).toBe('true')
      expect(html().getAttribute('data-a11y-line-spacing')).toBe('true')
      expect(html().getAttribute('data-a11y-reduced-motion')).toBe('true')
    })

    it('never exposes behavioral-only preferences as global attributes', () => {
      saveAccessibilityPreferences({ avoidPreciseGestures: true, calmMode: true, extraInteractionTime: true, keyboardFriendly: true })
      render(<GlobalScopeHarness />)

      Array.from(html().attributes)
        .map((attribute) => attribute.name)
        .filter((name) => name.startsWith('data-a11y-'))
        .forEach((name) => expect(ownedAttributes).toContain(name))
    })

    it('keeps the global state under StrictMode double mounting', () => {
      saveAccessibilityPreferences({ textSize: 'large', lineSpacing: true })
      render(
        <StrictMode>
          <GlobalScopeHarness />
        </StrictMode>,
      )

      expect(html().getAttribute('data-a11y-text-size')).toBe('large')
      expect(html().getAttribute('data-a11y-line-spacing')).toBe('true')
    })
  })

  describe('cleanup and stale attributes', () => {
    it('removes a disabled flag instead of leaving a stale "false" attribute', () => {
      applyAccessibilityDocumentScope({ textSize: 'large', highContrast: true, reduceMotion: true })
      applyAccessibilityDocumentScope({ textSize: 'normal', highContrast: false, reduceMotion: false })

      expect(html().hasAttribute('data-a11y-high-contrast')).toBe(false)
      expect(html().hasAttribute('data-a11y-reduced-motion')).toBe(false)
      expect(html().getAttribute('data-a11y-text-size')).toBe('normal')
    })

    it('falls back to normal for an unknown text size', () => {
      applyAccessibilityDocumentScope({ textSize: 'giant' })
      expect(html().getAttribute('data-a11y-text-size')).toBe('normal')
    })

    it('removes all owned attributes on unmount and leaves unrelated attributes alone', () => {
      html().setAttribute('lang', 'sv')
      html().setAttribute('data-unrelated', 'keep')
      saveAccessibilityPreferences({ textSize: 'large', highContrast: true, largeControls: true, lineSpacing: true, reduceMotion: true })
      const { unmount } = render(<GlobalScopeHarness />)

      unmount()

      ownedAttributes.forEach((attribute) => expect(html().hasAttribute(attribute)).toBe(false))
      expect(html().getAttribute('lang')).toBe('sv')
      expect(html().getAttribute('data-unrelated')).toBe('keep')
      html().removeAttribute('data-unrelated')
    })
  })

  describe('portals', () => {
    it('places portal-rendered dialogs inside the global accessibility scope', () => {
      saveAccessibilityPreferences({ textSize: 'large', highContrast: true, largeControls: true, lineSpacing: true, reduceMotion: true })
      render(
        <GlobalScopeHarness>
          <main className="app-shell">
            <PortalContent />
          </main>
        </GlobalScopeHarness>,
      )

      const dialog = screen.getByTestId('portal-dialog')
      expect(dialog.closest('.app-shell')).toBeNull()
      expect(dialog.parentElement).toBe(document.body)
      ownedAttributes.forEach((attribute) => {
        expect(dialog.closest(`[${attribute}]`)).toBe(html())
      })
    })
  })

  describe('reduced motion policy', () => {
    it('reports reduced motion from the app preference', () => {
      mockReducedMotionMedia(false)
      render(<GlobalScopeHarness />)
      expect(prefersReducedAccessibilityMotion()).toBe(false)
      expect(getAccessibilityScrollBehavior()).toBe('smooth')

      act(() => {
        saveAccessibilityPreferences({ reduceMotion: true })
      })

      expect(html().getAttribute('data-a11y-reduced-motion')).toBe('true')
      expect(prefersReducedAccessibilityMotion()).toBe(true)
      expect(getAccessibilityScrollBehavior()).toBe('auto')
    })

    it('reports reduced motion from the operating system without the app preference', () => {
      mockReducedMotionMedia(true)
      render(<GlobalScopeHarness />)

      expect(html().hasAttribute('data-a11y-reduced-motion')).toBe(false)
      expect(prefersReducedAccessibilityMotion()).toBe(true)
      expect(getAccessibilityScrollBehavior()).toBe('auto')
    })

    it('stays safe without matchMedia', () => {
      window.matchMedia = undefined
      expect(prefersReducedAccessibilityMotion()).toBe(false)
      expect(getAccessibilityScrollBehavior()).toBe('smooth')
    })
  })

  describe('global accessibility stylesheet', () => {
    it('is imported last in main.jsx so it applies on top of the base styles', () => {
      const cssImports = mainSource.match(/^import '[^']+\.css'$/gm)
      expect(cssImports.at(-1)).toBe("import './styles/accessibility.css'")
    })

    it('keys every preference rule on :root so portals inherit it', () => {
      ;['data-a11y-text-size', 'data-a11y-high-contrast', 'data-a11y-large-controls', 'data-a11y-line-spacing', 'data-a11y-reduced-motion'].forEach((attribute) => {
        expect(accessibilityCss).toContain(`:root[${attribute}`)
      })
      const splitTopLevel = (selectorList) => {
        const parts = []
        let depth = 0
        let current = ''
        for (const char of selectorList) {
          if (char === '(') depth += 1
          if (char === ')') depth -= 1
          if (char === ',' && depth === 0) {
            parts.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        parts.push(current.trim())
        return parts
      }
      const cssWithoutComments = accessibilityCss.replace(/\/\*[\s\S]*?\*\//g, '')
      const selectorLists = [...cssWithoutComments.matchAll(/([^{}]+)\{/g)].map(([, selectors]) => selectors.trim())
      const a11ySelectors = selectorLists
        .filter((selectors) => !selectors.startsWith('@'))
        .flatMap(splitTopLevel)
        .filter((selector) => selector.includes('[data-a11y-'))

      expect(a11ySelectors.length).toBeGreaterThan(10)
      a11ySelectors.forEach((selector) => expect(selector.startsWith(':root')).toBe(true))
    })

    it('moves the old app-wide attribute rules out of App.css', () => {
      expect(appCss).not.toMatch(/^\[data-a11y-reduced-motion='true'\] \*/m)
      expect(appCss).not.toMatch(/^\[data-a11y-text-size='large'\]/m)
    })

    it('scales text through the root font size as a percentage, so browser zoom and default size keep working', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-text-size='large'\]\s*\{[^}]*font-size:\s*112\.5%;/)
      expect(accessibilityCss).toMatch(/:root\[data-a11y-text-size='extra-large'\]\s*\{[^}]*font-size:\s*125%;/)
      expect(accessibilityCss).not.toMatch(/:root\[data-a11y-text-size[^\]]*\]\s*\{[^}]*font-size:\s*\d+px/)
      expect(accessibilityCss).toContain('.bottom-nav strong')
      expect(accessibilityCss).toMatch(/--accessibility-text-scale:\s*1;/)
    })

    // A11Y-8B visual verification: px overrides for central labels must only
    // apply to large/extra-large, so the normal size keeps each component's
    // own responsive px values (the normal view is unchanged by A11Y-8B).
    it('leaves fixed px labels untouched at the normal text size', () => {
      const cssWithoutComments = accessibilityCss.replace(/\/\*[\s\S]*?\*\//g, '')
      expect(cssWithoutComments).not.toMatch(/:root\[data-a11y-text-size\]\s+\.(bottom-nav|eyebrow)/)
      expect(cssWithoutComments).toMatch(/:root:is\(\[data-a11y-text-size='large'\], \[data-a11y-text-size='extra-large'\]\) \.bottom-nav strong/)
      expect(cssWithoutComments).toMatch(/:root:is\(\[data-a11y-text-size='large'\], \[data-a11y-text-size='extra-large'\]\) \.eyebrow/)
    })

    it('keeps extra-large bottom navigation labels uncut and lets fixed-geometry labels wrap', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-text-size='extra-large'\] \.bottom-nav strong\s*\{\s*font-size:\s*calc\(10px \* 1\.125\);/)
      expect(accessibilityCss).toMatch(/\.ai-coach-overlay-actions \.secondary-button\s*\{\s*white-space:\s*normal;/)
      expect(accessibilityCss).toMatch(/\.overview-tap-me\s*\{\s*height:\s*auto;\s*max-height:\s*none;/)
      expect(accessibilityCss).toMatch(/\.overview-primary-action-copy strong\s*\{\s*overflow-wrap:\s*anywhere;/)
    })

    it('stops infinite animations in both the app and the OS reduced-motion paths', () => {
      const appBlock = accessibilityCss.slice(accessibilityCss.indexOf(":root[data-a11y-reduced-motion='true'],"))
      const osBlock = accessibilityCss.slice(accessibilityCss.indexOf('@media (prefers-reduced-motion: reduce)'))
      ;[appBlock, osBlock].forEach((block) => {
        const declarations = block.slice(0, block.indexOf('}'))
        expect(declarations).toContain('animation-iteration-count: 1 !important;')
        expect(declarations).toContain('animation-duration: 1ms !important;')
        expect(declarations).toContain('transition-duration: 1ms !important;')
        expect(declarations).toContain('scroll-behavior: auto !important;')
      })
      expect(accessibilityCss).not.toContain('0.01ms')
    })

    it('gives larger controls a 44 x 44 px minimum', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-large-controls='true'\][^{]*button[^{]*\{\s*min-height:\s*44px !important;/)
      expect(accessibilityCss).toMatch(/:root\[data-a11y-large-controls='true'\] :is\(button, \[role='button'\]\)\s*\{\s*min-width:\s*44px !important;/)
    })

    it('applies line spacing to body text', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-line-spacing='true'\] body\s*\{\s*line-height:\s*1\.7;/)
      expect(accessibilityCss).toMatch(/:root\[data-a11y-line-spacing='true'\] :is\(p, li, dd, dt, blockquote, figcaption\)\s*\{\s*line-height:\s*1\.85;/)
    })

    it('raises the high-contrast tokens to WCAG AA against the app surfaces', () => {
      const block = accessibilityCss.slice(accessibilityCss.indexOf(":root[data-a11y-high-contrast='true'] {"))
      const tokens = Object.fromEntries(
        [...block.slice(0, block.indexOf('}')).matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, value]) => [name, value]),
      )
      const luminance = (hex) => {
        const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
          .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const contrast = (a, b) => {
        const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
        return (light + 0.05) / (dark + 0.05)
      }
      const surfaces = ['#07111f', '#0f1729', '#111827', '#1a2435']

      surfaces.forEach((surface) => {
        ;['--text', '--text-h', '--muted'].forEach((token) => expect(contrast(tokens[token], surface)).toBeGreaterThanOrEqual(4.5))
        ;['--border', '--field-border', '--nav-border'].forEach((token) => expect(contrast(tokens[token], surface)).toBeGreaterThanOrEqual(3))
      })
      expect(accessibilityCss).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid #ffffff;/)
    })

    it('never communicates pressed or current state by colour alone in high contrast', () => {
      expect(accessibilityCss).toMatch(/:root\[data-a11y-high-contrast='true'\] :is\(\[aria-pressed='true'\], \[aria-current='page'\], \[aria-selected='true'\]\)\s*\{\s*text-decoration: underline;/)
    })
  })
})
