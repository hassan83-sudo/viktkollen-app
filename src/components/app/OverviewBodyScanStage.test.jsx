/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { changeAppLanguage } from '../../i18n/index.js'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return {
    ...actual,
    createPortal: (node) => node,
  }
})

import OverviewBodyScanStage from './OverviewBodyScanStage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('OverviewBodyScanStage', () => {
  beforeEach(async () => {
    await changeAppLanguage('sv')
  })

  it('opens from Home as a full-screen kroppsscanning summary with scan rings', () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewDashboard.jsx'), 'utf8')
    const stageSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewBodyScanStage.jsx'), 'utf8')
    const talkSource = readFileSync(resolve(process.cwd(), 'src/components/app/BodyAvatarTalkBar.jsx'), 'utf8')
    const cssSource = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

    expect(dashboardSource).toContain('OverviewBodyScanStage')
    expect(dashboardSource).toContain('onOpenBodyScan')
    expect(dashboardSource).toContain('setBodyScanOpen(true)')
    expect(dashboardSource).toContain('BodyScanRings')
    expect(dashboardSource).toContain('currentWeight={currentWeight}')
    expect(dashboardSource).toContain('weather={weather}')
    expect(stageSource).toContain('createPortal')
    expect(stageSource).toContain("t('yourBodyToday')")
    expect(stageSource).toContain('BodyAvatarViewer')
    expect(stageSource).toContain("t('startScan')")
    expect(stageSource).toContain("t('newScan')")
    expect(stageSource).toContain("t('bodyComposition')")
    expect(stageSource).toContain("t('posture')")
    expect(talkSource).toContain('🎙 Prata')
    expect(stageSource).toContain('BodyAvatarTalkBar')
    expect(stageSource).toContain('onStartVoiceInput')
    expect(talkSource).toContain("showText ? 'Dölj text' : 'Text'")
    expect(stageSource).toContain('createDefaultBodySimulationState')
    expect(stageSource).toContain("t('visualSimulation')")
    expect(stageSource).toContain("t('changeBody')")
    expect(stageSource).toContain("t('smartCamera')")
    expect(dashboardSource).toContain('onStartVoiceInput={onStartVoiceInput}')
    expect(dashboardSource).toContain('onVoiceCleanup={onVoiceCleanup}')
    expect(cssSource).toContain('.overview-body-scan-rings')
    expect(cssSource).toContain('prefers-reduced-motion')
    expect(cssSource).toContain('max-width: 390px')
    expect(cssSource).toContain('Do not shrink avatar to make controls fit.')
    expect(cssSource).toContain('min-height: clamp(355px, 48svh, 430px)')
    expect(cssSource).toContain('min-height: 52px')
    expect(cssSource).toMatch(/\.overview-body-scan-hero img \{[\s\S]*?object-fit:\s*contain;/)
    expect(cssSource).not.toContain('scale(2.05)')
  })

  it('renders real weather and missing states without fake UV copy', () => {
    const html = renderToStaticMarkup(
      <OverviewBodyScanStage
        currentWeight={83.8}
        weather={{
          city: 'Helsingborg',
          condition: 'Halvklart',
          feelsLikeC: null,
          hasLiveWeather: true,
          icon: '⛅',
          precipitationRiskPercent: 20,
          sunrise: '2026-08-20T05:47:00',
          sunriseLabel: '05:47',
          sunset: '2026-08-20T20:28:00',
          sunsetLabel: '20:28',
          temperatureC: 16,
          windSpeedMs: 7,
        }}
        weights={[
          { date: '2026-07-21', value: 85.2 },
          { date: '2026-08-20', value: 83.8 },
        ]}
        onClose={() => {}}
        onStartScan={() => {}}
      />,
    )

    expect(html).toContain('Din kropp idag')
    expect(html).toContain('83,8 kg')
    expect(html).not.toContain('Helsingborg')
    expect(html).not.toContain('7 m/s')
    expect(html).not.toMatch(/UV-index|uv-index/i)
    expect(html).toContain('overview-body-scan-rings')
    expect(html).toContain('🎙 Prata')
    expect(html).toContain('Dra för att rotera')
    expect(html).toContain('Väder &amp; kläder')
    expect(html).not.toContain('VISUELL SIMULERING')
  })

  it('keeps secondary content closed initially and opens one compact section at a time', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <OverviewBodyScanStage
          onClose={() => {}}
          onStartScan={() => {}}
          weather={{
            city: 'Helsingborg',
            condition: 'Halvklart',
            feelsLikeC: 14,
            hasLiveWeather: true,
            icon: '⛅',
            precipitationRiskPercent: 20,
            sunrise: '2026-08-20T05:47:00',
            sunriseLabel: '05:47',
            sunset: '2026-08-20T20:28:00',
            sunsetLabel: '20:28',
            temperatureC: 16,
            windSpeedMs: 7,
          }}
        />,
      )
    })

    const editorButton = [...container.querySelectorAll('.body-avatar-accordion-trigger')]
      .find((button) => button.textContent.includes('Ändra kropp'))
    const weatherButton = [...container.querySelectorAll('.body-avatar-accordion-trigger')]
      .find((button) => button.textContent.includes('Väder & kläder'))

    expect(editorButton.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('VISUELL SIMULERING')

    act(() => editorButton.click())
    expect(editorButton.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('VISUELL SIMULERING')

    const firstSlider = container.querySelector('.body-avatar-slider input')
    act(() => {
      firstSlider.value = '50'
      firstSlider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const resetButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Återställ'))
    act(() => resetButton.click())
    expect(container.querySelector('.body-avatar-slider input').value).toBe('0')

    act(() => weatherButton.click())
    expect(container.textContent).not.toContain('VISUELL SIMULERING')
    expect(container.textContent).toContain('Klädråd')
    expect(container.textContent).toContain('Helsingborg')
    expect(container.textContent).toContain('Måttlig vind')

    act(() => root.unmount())
    container.remove()
  })

  it('does not stop an active voice conversation when weather data refreshes', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const onVoiceCleanup = vi.fn()
    const onLiveContextChange = vi.fn()
    // Stable references across both renders - only `weather` should change,
    // so the fix under test is isolated from unrelated callback-identity churn.
    const onClose = () => {}
    const onStartScan = () => {}

    act(() => {
      root.render(
        <OverviewBodyScanStage
          currentWeight={83.8}
          onClose={onClose}
          onLiveContextChange={onLiveContextChange}
          onStartScan={onStartScan}
          onVoiceCleanup={onVoiceCleanup}
          weather={{ city: 'Helsingborg', temperatureC: 16 }}
        />,
      )
    })

    expect(onVoiceCleanup).not.toHaveBeenCalled()
    expect(onLiveContextChange).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <OverviewBodyScanStage
          currentWeight={83.8}
          onClose={onClose}
          onLiveContextChange={onLiveContextChange}
          onStartScan={onStartScan}
          onVoiceCleanup={onVoiceCleanup}
          weather={{ city: 'Helsingborg', temperatureC: 18 }}
        />,
      )
    })

    expect(onVoiceCleanup).not.toHaveBeenCalled()
    expect(onLiveContextChange).toHaveBeenCalledTimes(2)

    act(() => root.unmount())
    expect(onVoiceCleanup).toHaveBeenCalledTimes(1)
    container.remove()
  })
})
