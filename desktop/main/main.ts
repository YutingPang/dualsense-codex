import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron'
import type { NativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { devices } from 'node-hid'
import { loadConfig, saveConfig, validateConfig } from '../../src/layers.js'
import { logger } from '../../src/logger.js'
import type { ApplyConfigRequest, ConfigEnvelope, DesktopSnapshot } from '../shared/contracts.js'
import { IPC } from '../shared/contracts.js'
import { DesktopRuntime } from './runtime.js'
import { QuitGate } from './quit-gate.js'
import { trayIconDataUrl, trayStateKey, trayTooltip, type TrayState } from './tray.js'

function configRevision(config: unknown): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

function readConfig(): ConfigEnvelope {
  const config = loadConfig()
  return { config, revision: configRevision(config) }
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

const windowViteDevServerUrl =
  typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
    ? undefined
    : MAIN_WINDOW_VITE_DEV_SERVER_URL
const windowViteName =
  typeof MAIN_WINDOW_VITE_NAME === 'undefined' ? 'main_window' : MAIN_WINDOW_VITE_NAME

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
let chatGptRunning = false
let chatGptPoll: ReturnType<typeof setInterval> | null = null
let lastTrayStateKey: string | null = null
const quitGate = new QuitGate()

function notifySnapshot(): void {
  updateTrayPresentation()
  mainWindow?.webContents.send(IPC.getSnapshot, snapshot())
}

function setChatGptPresence(running: boolean): void {
  if (running === chatGptRunning) return
  chatGptRunning = running
  notifySnapshot()
}

function refreshChatGptPresence(): void {
  // The migrated desktop app is named ChatGPT, while older Codex builds used
  // Codex as the process name. Keep the latter as a compatibility fallback.
  execFile('pgrep', ['-x', 'ChatGPT'], (error) => {
    if (!error) {
      setChatGptPresence(true)
      return
    }
    execFile('pgrep', ['-x', 'Codex'], (legacyError) => {
      setChatGptPresence(!legacyError)
    })
  })
}

function wakeChatGpt(): void {
  execFile('open', ['-b', 'com.openai.codex'], (error) => {
    if (error) {
      execFile('open', ['-a', 'ChatGPT'], (fallbackError) => {
        if (fallbackError) execFile('open', ['-a', 'Codex'])
        refreshChatGptPresence()
      })
      return
    }
    refreshChatGptPresence()
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
    chatgpt: { running: chatGptRunning },
    app: { version: app.getVersion(), packaged: app.isPackaged },
  }
}

function currentTrayState(): TrayState {
  return {
    controllerConnected: runtime?.isConnected ?? false,
    chatGptRunning,
    paused: runtime?.isPaused ?? manuallyPaused,
  }
}

/**
 * Build the menu-bar image (18px + 36px Retina representation).
 *
 * The assets are PNGs: Electron returns an empty image for SVG data URLs and
 * `new Tray(emptyImage)` still succeeds, so an SVG here leaves the menu bar
 * blank. See desktop/main/tray-icons.ts.
 */
function trayImage(controllerConnected: boolean): NativeImage {
  const image = nativeImage.createFromDataURL(trayIconDataUrl(controllerConnected, 1))
  try {
    image.addRepresentation({
      scaleFactor: 2,
      dataURL: trayIconDataUrl(controllerConnected, 2),
    })
  } catch (error) {
    logger.warn('could not add the 2x tray icon representation', error)
  }
  image.setTemplateImage(true)
  return image
}

/**
 * Apply the tray image, falling back to a short text title if decoding fails.
 *
 * A menu-bar app with an invisible icon is unreachable; a text fallback keeps
 * the settings window and Quit reachable even after an asset regression.
 */
function applyTrayImage(controllerConnected: boolean): void {
  if (!tray) return
  const image = trayImage(controllerConnected)
  if (image.isEmpty()) {
    tray.setTitle('DS')
    logger.error('tray icon could not be decoded; using the text fallback')
    return
  }
  tray.setTitle('')
  tray.setImage(image)
}

function updateTrayMenu(state: TrayState): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Controller: ${state.controllerConnected ? 'Connected' : 'Not connected'}`,
        enabled: false,
      },
      {
        label: `ChatGPT: ${state.chatGptRunning ? 'Running' : 'Offline'}`,
        enabled: false,
      },
      { type: 'separator' },
      { label: 'Open Settings', click: () => showMainWindow() },
      {
        label: state.paused ? 'Resume Controller' : 'Pause Controller',
        click: () => {
          manuallyPaused = !manuallyPaused
          runtime?.setPaused(manuallyPaused)
          updateTrayPresentation()
          mainWindow?.webContents.send(IPC.getSnapshot, snapshot())
        },
      },
      { type: 'separator' },
      { label: 'Quit DualSense for Codex', click: () => app.quit() },
    ]),
  )
}

function updateTrayPresentation(): void {
  if (!tray) return
  const state = currentTrayState()
  const stateKey = trayStateKey(state)
  if (stateKey === lastTrayStateKey) return

  lastTrayStateKey = stateKey
  applyTrayImage(state.controllerConnected)
  tray.setToolTip(trayTooltip(state))
  updateTrayMenu(state)
}

function showMainWindow(): void {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    return
  }

  const dirname = path.dirname(fileURLToPath(import.meta.url))
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 1000,
    minHeight: 720,
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
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return
    logger.error('settings window failed to load', { code, description, url })
    // Drop the broken window so opening Settings retries the load instead of
    // presenting a permanently blank webContents.
    const failed = mainWindow
    failed?.destroy()
    if (mainWindow === failed) mainWindow = null
    dialog.showErrorBox(
      'DualSense for Codex',
      `The settings window failed to load (${code} ${description}).\n\nLog: ~/.openmicro/openmicro.log`,
    )
  })

  if (windowViteDevServerUrl) {
    void mainWindow.loadURL(windowViteDevServerUrl)
  } else {
    void mainWindow.loadFile(path.join(dirname, `../renderer/${windowViteName}/index.html`))
  }
}

function destroyTray(): void {
  tray?.destroy()
  tray = null
  lastTrayStateKey = null
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())
  app.on('before-quit', (event) => {
    quitting = true
    const phase = quitGate.begin()
    if (phase === 'finished') {
      destroyTray()
      return
    }
    // Defer the first quit while draining, and every repeated Quit too: the
    // old null-runtime branch let a second Cmd+Q exit mid-drain and strand
    // modifiers. See QuitGate.
    event.preventDefault()
    if (phase === 'waiting') return

    if (chatGptPoll) clearInterval(chatGptPoll)
    chatGptPoll = null
    const activeRuntime = runtime
    runtime = null
    const timeout = new Promise<void>((resolve) => {
      setTimeout(resolve, 6000).unref?.()
    })
    void Promise.race([activeRuntime ? activeRuntime.stop() : Promise.resolve(), timeout])
      .catch((error: unknown) => logger.warn('runtime shutdown failed', error))
      .finally(() => {
        quitGate.complete()
        destroyTray()
        app.quit()
      })
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
    updateTrayPresentation()
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

  function startCompanion(): void {
    runtime = new DesktopRuntime(readConfig().config, {
      onStateChange: notifySnapshot,
      onPlayStation: wakeChatGpt,
    })
    runtime.start()
    app.setLoginItemSettings({
      openAtLogin: true,
      // Electron supports this macOS setting even though the installed type
      // declarations do not expose it yet.
      ...({ openAsHidden: true } as Record<string, boolean>),
    })
    refreshChatGptPresence()
    chatGptPoll = setInterval(refreshChatGptPresence, 1500)
    tray = new Tray(trayImage(currentTrayState().controllerConnected))
    tray.on('click', () => showMainWindow())
    updateTrayPresentation()
    if (!app.getLoginItemSettings().wasOpenedAtLogin) showMainWindow()
  }

  // Catch configuration and runtime-start failures so they surface in a dialog
  // instead of an invisible process. Failures during static imports (e.g. a
  // missing native prebuild) happen before this promise chain and cannot be
  // caught here.
  void app
    .whenReady()
    .then(startCompanion)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('DualSense for Codex failed to start:', message)
      logger.error('desktop startup failed', error)
      try {
        dialog.showErrorBox(
          'DualSense for Codex could not start',
          `${message}\n\nConfig: ~/.openmicro/config.json\nLog: ~/.openmicro/openmicro.log`,
        )
      } catch {
        // The dialog needs a ready app; stderr above still reports the failure.
      }
      app.quit()
    })
}
