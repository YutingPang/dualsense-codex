import type { ControlId, OpenMicroConfig } from '../../src/layers.js'

export type ControllerKind = 'dualsense' | 'dualsense-edge' | 'other' | 'none'

export interface DesktopSnapshot {
  controller: {
    connected: boolean
    kind: ControllerKind
    productName: string | null
  }
  runtime: {
    paused: boolean
    reason: 'manual' | null
  }
  chatgpt: {
    running: boolean
  }
  app: {
    version: string
    packaged: boolean
  }
}

export interface DesktopBridge {
  getSnapshot(): Promise<DesktopSnapshot>
  refreshController(): Promise<DesktopSnapshot>
  setPaused(paused: boolean): Promise<DesktopSnapshot>
  getConfig(): Promise<ConfigEnvelope>
  applyConfig(request: ApplyConfigRequest): Promise<ConfigEnvelope>
}

export interface ConfigEnvelope {
  config: OpenMicroConfig
  revision: string
}

export interface ApplyConfigRequest {
  config: OpenMicroConfig
  baseRevision: string
}

export type { ControlId, OpenMicroConfig }

export const IPC = {
  getSnapshot: 'desktop:get-snapshot',
  refreshController: 'desktop:refresh-controller',
  setPaused: 'desktop:set-paused',
  getConfig: 'desktop:get-config',
  applyConfig: 'desktop:apply-config',
} as const
