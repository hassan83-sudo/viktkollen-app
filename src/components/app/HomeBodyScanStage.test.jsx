/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { changeAppLanguage } from '../../i18n/index.js'

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom')
  return {
    ...actual,
    createPortal: (node) => node,
  }
})

vi.mock('../BodyAnalysisCard.jsx', () => ({
  default: () => <div data-testid="real-body-analysis-card">real body analysis card</div>,
}))

import HomeBodyScanStage from './HomeBodyScanStage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const stageSource = readFileSync(resolve(process.cwd(), 'src/components/app/HomeBodyScanStage.jsx'), 'utf8')
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/components/app/OverviewDashboard.jsx'), 'utf8')

describe('HomeBodyScanStage', () => {
  it('never routes through Mer/progress navigation - it mounts the real card directly', () => {
    expect(stageSource).toContain('BodyAnalysisCard')
    expect(stageSource).not.toContain('onNavigateSection')
    expect(stageSource).not.toContain("'progress'")
    expect(stageSource).not.toContain('body-analysis')
  })

  it('is wired from the Home Kroppsscanning card without opening Mer', () => {
    expect(dashboardSource).toContain('setBodyCaptureOpen(true)')
    expect(dashboardSource).toContain('<HomeBodyScanStage')
    expect(dashboardSource).not.toContain("onNavigateSection('progress', 'body-analysis')")
  })

  it('shows a short consent screen before mounting the real Body Scan component', async () => {
    await changeAppLanguage('sv')
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(<HomeBodyScanStage onClose={() => {}} profile={{}} userId="local-user" weights={[]} />)
    })

    expect(container.querySelector('[data-testid="real-body-analysis-card"]')).toBeNull()
    expect(container.textContent).toContain('Ta tre bilder')

    const startButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ta tre bilder')
    await act(async () => {
      startButton.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('[data-testid="real-body-analysis-card"]')).toBeTruthy()

    act(() => root.unmount())
    container.remove()
  })
})
