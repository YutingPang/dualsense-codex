import { describe, expect, it } from 'vitest'
import { trayIconDataUrl, trayIconSvg, trayStateKey, trayTooltip } from '../desktop/main/tray.js'

describe('tray presentation', () => {
  it('uses an outline icon when the controller is disconnected', () => {
    const icon = trayIconSvg(false)

    expect(icon).toContain('fill="none"')
    expect(icon).toContain('stroke="black"')
    expect(icon).not.toContain('fill-rule="evenodd"')
  })

  it('uses a filled icon when the controller is connected', () => {
    const icon = trayIconSvg(true)

    expect(icon).toContain('fill-rule="evenodd"')
    expect(icon).not.toContain('stroke="black"')
  })

  it('returns an encoded SVG data URL for Electron nativeImage', () => {
    expect(trayIconDataUrl(true)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(trayIconDataUrl(true)).toContain('%3Csvg')
  })

  it('keeps controller and ChatGPT state independent in the tooltip', () => {
    expect(trayTooltip({ controllerConnected: true, chatGptRunning: false, paused: false })).toBe(
      'DualSense for Codex — Connected · ChatGPT offline',
    )
    expect(trayTooltip({ controllerConnected: false, chatGptRunning: true, paused: true })).toBe(
      'DualSense for Codex — Not connected · ChatGPT running · Paused',
    )
  })

  it('changes the presentation key when any visible state changes', () => {
    const connected = { controllerConnected: true, chatGptRunning: true, paused: false }

    expect(trayStateKey(connected)).not.toBe(
      trayStateKey({ ...connected, controllerConnected: false }),
    )
    expect(trayStateKey(connected)).not.toBe(trayStateKey({ ...connected, chatGptRunning: false }))
    expect(trayStateKey(connected)).not.toBe(trayStateKey({ ...connected, paused: true }))
  })
})
