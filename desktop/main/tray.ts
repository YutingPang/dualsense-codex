/**
 * macOS menu-bar presentation for the desktop companion.
 *
 * Icons are PNG template images generated into tray-icons.ts. Electron's
 * nativeImage cannot decode SVG data URLs — it silently returns an empty 0x0
 * image, and `new Tray(emptyImage)` still succeeds, which made the menu-bar
 * item invisible. Keep the raster path here; the shape generator lives in
 * scripts/gen-tray-icons.py.
 */

import {
  TRAY_ICON_CONNECTED_1X,
  TRAY_ICON_CONNECTED_2X,
  TRAY_ICON_DISCONNECTED_1X,
  TRAY_ICON_DISCONNECTED_2X,
} from './tray-icons.js'

export interface TrayState {
  controllerConnected: boolean
  chatGptRunning: boolean
  paused: boolean
}

/** 1 = 18px menu-bar asset, 2 = 36px Retina representation. */
export type TrayIconScale = 1 | 2

/**
 * Decode the generated PNG for the current controller state.
 *
 * Args:
 *     controllerConnected (boolean): True when the runtime owns a controller.
 *     scale (TrayIconScale): 1 for the 18px asset, 2 for the 36px asset.
 *
 * Returns:
 *     Buffer: PNG bytes, ready for nativeImage.createFromBuffer/dataURL.
 */
export function trayIconPng(controllerConnected: boolean, scale: TrayIconScale = 1): Buffer {
  const encoded = controllerConnected
    ? scale === 2
      ? TRAY_ICON_CONNECTED_2X
      : TRAY_ICON_CONNECTED_1X
    : scale === 2
      ? TRAY_ICON_DISCONNECTED_2X
      : TRAY_ICON_DISCONNECTED_1X
  return Buffer.from(encoded, 'base64')
}

/**
 * Data URL for the generated PNG. Always `image/png` — never SVG.
 *
 * Args:
 *     controllerConnected (boolean): True when the runtime owns a controller.
 *     scale (TrayIconScale): 1 for the 18px asset, 2 for the 36px asset.
 *
 * Returns:
 *     string: `data:image/png;base64,...` URL accepted by nativeImage.
 */
export function trayIconDataUrl(controllerConnected: boolean, scale: TrayIconScale = 1): string {
  return `data:image/png;base64,${trayIconPng(controllerConnected, scale).toString('base64')}`
}

export function trayTooltip(state: TrayState): string {
  const controller = state.controllerConnected ? 'Connected' : 'Not connected'
  const chatGpt = state.chatGptRunning ? 'ChatGPT running' : 'ChatGPT offline'
  const paused = state.paused ? ' · Paused' : ''
  return `DualSense for Codex — ${controller} · ${chatGpt}${paused}`
}

export function trayStateKey(state: TrayState): string {
  return [state.controllerConnected, state.chatGptRunning, state.paused].join(':')
}
