/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return {
    ...actual,
    createPortal: (node) => node,
  }
})

import OverviewBodyScanStage from './OverviewBodyScanStage.jsx'

describe('OverviewBodyScanStage', () => {
  it('opens from Home as a full-screen kroppsscanning summary with scan rings', () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewDashboard.jsx'), 'utf8')
    const stageSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewBodyScanStage.jsx'), 'utf8')
    const talkSource = readFileSync(resolve(process.cwd(), 'src/components/app/BodyAvatarTalkBar.jsx'), 'utf8')
    const cssSource = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

    expect(dashboardSource).toContain('OverviewBodyScanStage')
    expect(dashboardSource).toContain('onOpenBodyScan')
    expect(dashboardSource).toContain('onStartBodyScan')
    expect(dashboardSource).toContain('BodyScanRings')
    expect(dashboardSource).toContain('currentWeight={currentWeight}')
    expect(dashboardSource).toContain('weather={weather}')
    expect(stageSource).toContain('createPortal')
    expect(stageSource).toContain('Din kropp idag')
    expect(stageSource).toContain('BodyAvatarViewer')
    expect(stageSource).toContain('Starta scanning')
    expect(stageSource).toContain('Ny scanning')
    expect(stageSource).toContain('Kroppssammansättning')
    expect(stageSource).toContain('Hållning')
    expect(talkSource).toContain('🎙 Prata')
    expect(stageSource).toContain('BodyAvatarTalkBar')
    expect(stageSource).toContain('onStartVoiceInput')
    expect(talkSource).toContain('Textalternativ')
    expect(stageSource).toContain('createDefaultBodySimulationState')
    expect(stageSource).toContain('VISUELL SIMULERING')
    expect(stageSource).toContain('Ändra kropp')
    expect(stageSource).toContain('Smart kamera')
    expect(dashboardSource).toContain('onStartVoiceInput={onStartVoiceInput}')
    expect(dashboardSource).toContain('onVoiceCleanup={onVoiceCleanup}')
    expect(cssSource).toContain('.overview-body-scan-rings')
    expect(cssSource).toContain('prefers-reduced-motion')
    expect(cssSource).toContain('max-width: 390px')
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
    expect(html).toContain('Helsingborg')
    expect(html).toContain('7 m/s')
    expect(html).toContain('Måttlig vind')
    expect(html).toContain('05:47')
    expect(html).toContain('20:28')
    expect(html).toContain('Känns som')
    expect(html).toContain('saknas')
    expect(html).not.toMatch(/UV-index|uv-index/i)
    expect(html).toContain('overview-body-scan-rings')
    expect(html).toContain('🎙 Prata')
    expect(html).toContain('Dra för att rotera')
    expect(html).toContain('Vad passar att ha på sig')
  })
})
