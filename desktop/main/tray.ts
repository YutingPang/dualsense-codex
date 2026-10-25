/**
 * macOS menu-bar presentation for the desktop companion.
 *
 * These are deliberately monochrome template SVGs. macOS applies the correct
 * foreground color for light and dark menu bars, while the geometry itself
 * communicates whether the controller is connected.
 */

export interface TrayState {
  controllerConnected: boolean
  chatGptRunning: boolean
  paused: boolean
}

const CONTROLLER_PATH =
  'M4 5.5h10c.7 0 1.3.4 1.6 1l1.7 3.5c.5 1.1.3 2.4-.5 3.3l-.1.1c-.9.9-2.4.7-3-.4L12.6 12H5.4l-1.1 1c-.6 1.1-2.1 1.3-3 .4l-.1-.1c-.8-.9-1-2.2-.5-3.3l1.7-3.5c.3-.6.9-1 1.6-1Z'

const CONTROLLER_DETAILS =
  'M5 7.2h1.5v1.5H8v1.5H6.5v1.5H5v-1.5H3.5V8.7H5V7.2Zm8.2 1.1a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Zm2 1.4a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z'

const OUTLINE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <path d="${CONTROLLER_PATH}" fill="none" stroke="black" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${CONTROLLER_DETAILS}" fill="black"/>
</svg>`

const FILLED_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <path d="${CONTROLLER_PATH} ${CONTROLLER_DETAILS}" fill="black" fill-rule="evenodd"/>
</svg>`

export function trayIconSvg(controllerConnected: boolean): string {
  return controllerConnected ? FILLED_ICON : OUTLINE_ICON
}

export function trayIconDataUrl(controllerConnected: boolean): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trayIconSvg(controllerConnected))}`
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
