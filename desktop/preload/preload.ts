import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApplyConfigRequest,
  ConfigEnvelope,
  DesktopBridge,
  DesktopSnapshot,
} from '../shared/contracts.js'
import { IPC } from '../shared/contracts.js'

const bridge: DesktopBridge = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<DesktopSnapshot>,
  refreshController: () => ipcRenderer.invoke(IPC.refreshController) as Promise<DesktopSnapshot>,
  setPaused: (paused) => ipcRenderer.invoke(IPC.setPaused, paused) as Promise<DesktopSnapshot>,
  getConfig: () => ipcRenderer.invoke(IPC.getConfig) as Promise<ConfigEnvelope>,
  applyConfig: (request: ApplyConfigRequest) =>
    ipcRenderer.invoke(IPC.applyConfig, request) as Promise<ConfigEnvelope>,
}

contextBridge.exposeInMainWorld('openMicroDesktop', bridge)
