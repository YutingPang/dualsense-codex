import { describe, expect, it } from 'vitest'
import { trayIconDataUrl, trayIconPng, trayStateKey, trayTooltip } from '../desktop/main/tray.js'
import type { TrayIconScale } from '../desktop/main/tray.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Read width/height from a PNG's IHDR chunk; null when this is not a PNG. */
function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

describe('tray presentation', () => {
  // Regression: these used to be SVG data URLs. Electron's nativeImage returns
  // an empty 0x0 image for those while `new Tray()` still succeeds, leaving the
  // menu-bar app invisible. This checks the PNG envelope and dimensions; actual
  // nativeImage decoding is guarded at runtime by the text fallback in main.ts.
  it('returns 18px PNGs with valid headers for both controller states', () => {
    for (const connected of [true, false]) {
      const png = trayIconPng(connected)
      expect(pngSize(png), 'menu-bar icon must be a PNG').toEqual({ width: 18, height: 18 })
      expect(trayIconDataUrl(connected)).toMatch(/^data:image\/png;base64,/)
    }
  })

  it('provides a 36px Retina representation', () => {
    for (const connected of [true, false]) {
      expect(pngSize(trayIconPng(connected, 2))).toEqual({ width: 36, height: 36 })
    }
  })

  it('makes connected and disconnected states visually distinct', () => {
    expect(trayIconPng(true).equals(trayIconPng(false))).toBe(false)
    expect(trayIconDataUrl(true)).not.toBe(trayIconDataUrl(false))
    expect(trayIconDataUrl(true, 2)).not.toBe(trayIconDataUrl(true, 1))
  })

  it('accepts every scale without changing the type', () => {
    const scales: TrayIconScale[] = [1, 2]
    for (const scale of scales) {
      expect(trayIconPng(true, scale).subarray(1, 4).toString('ascii')).toBe('PNG')
    }
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
