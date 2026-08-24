/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import BodyAvatarViewer from './BodyAvatarViewer.jsx'
import { AVATAR_FRONT_SRC } from '../../services/bodyAvatarModel.js'

describe('BodyAvatarViewer', () => {
  it('shows the brand avatar PNG, scan rings and rotation UI without CSS 3D fakes', () => {
    const html = renderToStaticMarkup(<BodyAvatarViewer view="front" />)
    const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

    expect(html).toContain(AVATAR_FRONT_SRC)
    expect(html).toContain('overview-body-scan-rings')
    expect(html).toContain('Dra för att rotera')
    expect(html).toContain('Fram')
    expect(html).toContain('Sida')
    expect(html).toContain('Bak')
    expect(html).not.toContain('rotateY')
    expect(css).not.toContain('rotateY(')
  })
})
