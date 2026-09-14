import type { DesktopBridge } from '../shared/contracts.js'

declare global {
  interface Window {
    openMicroDesktop: DesktopBridge
  }
}

export {}
