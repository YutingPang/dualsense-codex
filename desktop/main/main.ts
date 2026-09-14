import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { devices } from 'node-hid'
import { loadConfig, saveConfig, validateConfig } from '../../src/layers.js'
import type { ApplyConfigRequest, ConfigEnvelope, DesktopSnapshot } from '../shared/contracts.js'
import { IPC } from '../shared/contracts.js'
import { DesktopRuntime } from './runtime.js'

function configRevision(config: unknown): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

function readConfig(): ConfigEnvelope {
  const config = loadConfig()
  return { config, revision: configRevision(config) }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

const DUALSENSE_VENDOR_ID = 0x054c
const DUALSENSE_PRODUCT_IDS = new Map([
  [0x0ce6, 'dualsense' as const],
  [0x0df2, 'dualsense-edge' as const],
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let manuallyPaused = false
let quitting = false
let runtime: DesktopRuntime | null = null
let codexRunning = false
let codexPoll: ReturnType<typeof setInterval> | null = null

function notifySnapshot(): void {
  mainWindow?.webContents.send(IPC.getSnapshot, snapshot())
}

function refreshCodexPresence(): void {
  execFile('pgrep', ['-x', 'Codex'], (error) => {
    const running = !error
    if (running === codexRunning) return
    codexRunning = running
    notifySnapshot()
  })
}

function wakeCodex(): void {
  execFile('open', ['-b', 'com.openai.codex'], (error) => {
    if (error) execFile('open', ['-a', 'Codex'])
    refreshCodexPresence()
  })
}

function controllerSnapshot(): DesktopSnapshot['controller'] {
  try {
    const available = devices()
    const dualSense = available.find(
      (device) =>
        device.vendorId === DUALSENSE_VENDOR_ID && DUALSENSE_PRODUCT_IDS.has(device.productId),
    )
    if (dualSense) {
      return {
        connected: true,
        kind: DUALSENSE_PRODUCT_IDS.get(dualSense.productId) ?? 'dualsense',
        productName: dualSense.product ?? 'DualSense wireless controller',
      }
    }

    const controller = available.find(
      (device) => device.usagePage === 0x01 && (device.usage === 0x04 || device.usage === 0x05),
    )
    if (controller) {
      return {
        connected: true,
        kind: 'other',
        productName: controller.product ?? 'Game controller',
      }
    }
  } catch {
    // Enumeration errors are represented as disconnected in this first probe.
  }

  return { connected: false, kind: 'none', productName: null }
}

function snapshot(): DesktopSnapshot {
  const controller = controllerSnapshot()
  return {
    controller: runtime?.isConnected ? { ...controller, connected: true } : controller,
    runtime: {
      paused: runtime?.isPaused ?? manuallyPaused,
      reason: manuallyPaused ? 'manual' : null,
    },
    codex: { running: codexRunning },
    app: { version: app.getVersion(), packaged: app.isPackaged },
  }
}

function updateTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Settings', click: () => showMainWindow() },
      {
        label: manuallyPaused ? 'Resume Controller' : 'Pause Controller',
        click: () => {
          manuallyPaused = !manuallyPaused
          runtime?.setPaused(manuallyPaused)
          updateTrayMenu()
          mainWindow?.webContents.send(IPC.getSnapshot, snapshot())
        },
      },
      { type: 'separator' },
      { label: 'Quit DualSense for Codex', click: () => app.quit() },
    ]),
  )
}

function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  const dirname = path.dirname(fileURLToPath(import.meta.url))
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'DualSense for Codex',
    backgroundColor: '#0a0d12',
    webPreferences: {
      preload: path.join(dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app.on('before-quit', () => {
    quitting = true
    if (codexPoll) clearInterval(codexPoll)
    codexPoll = null
    runtime?.stop()
    runtime = null
  })
  app.on('window-all-closed', () => {
    // The menu-bar app remains available until the user chooses Quit.
  })

  ipcMain.handle(IPC.getSnapshot, () => snapshot())
  ipcMain.handle(IPC.refreshController, () => snapshot())
  ipcMain.handle(IPC.setPaused, (_event, paused: unknown) => {
    if (typeof paused !== 'boolean') throw new TypeError('paused must be a boolean')
    manuallyPaused = paused
    runtime?.setPaused(paused)
    updateTrayMenu()
    return snapshot()
  })
  ipcMain.handle(IPC.getConfig, () => readConfig())
  ipcMain.handle(IPC.applyConfig, (_event, request: ApplyConfigRequest) => {
    if (!request || typeof request.baseRevision !== 'string') {
      throw new TypeError('A configuration and base revision are required')
    }
    const current = readConfig()
    if (current.revision !== request.baseRevision) {
      throw new Error('Configuration changed on disk. Reload it before applying your edits.')
    }
    const config = validateConfig(request.config)
    saveConfig(config)
    runtime?.applyConfig(config)
    return { config, revision: configRevision(config) }
  })

  void app.whenReady().then(() => {
    runtime = new DesktopRuntime(readConfig().config, {
      onStateChange: notifySnapshot,
      onPlayStation: wakeCodex,
    })
    runtime.start()
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
    refreshCodexPresence()
    codexPoll = setInterval(refreshCodexPresence, 1500)
    const trayIcon = nativeImage.createFromDataURL(
      'data:image/svg+xml;charset=utf-8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path fill="black" d="M4 5h10l3 5v4a2 2 0 0 1-3.4 1.4L12.2 14H5.8l-1.4 1.4A2 2 0 0 1 1 14v-4l3-5Zm2 2v2H4v2h2v2h2v-2h2V9H8V7H6Zm7 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm2 3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>',
        ),
    )
    trayIcon.setTemplateImage(true)
    tray = new Tray(trayIcon)
    tray.setToolTip('DualSense for Codex')
    tray.on('click', () => showMainWindow())
    updateTrayMenu()
    if (!app.getLoginItemSettings().wasOpenedAtLogin) showMainWindow()
  })
}
