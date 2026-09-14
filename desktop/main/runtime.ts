import type { EventEmitter } from 'node:events'
import { HidManager } from '../../src/controller/hid-manager.js'
import { dispatchAction } from '../../src/dispatch.js'
import type { DispatchDeps } from '../../src/dispatch.js'
import { codexAppHarness } from '../../src/harness/codex-app.js'
import type { Action, Harness } from '../../src/harness/types.js'
import { KeyRepeater } from '../../src/keymap.js'
import type { OpenMicroConfig } from '../../src/layers.js'
import { logger } from '../../src/logger.js'
import { TouchpadGestureTracker } from '../../src/pointer.js'
import { LayerRouter } from '../../src/router.js'
import type { ButtonId, ControllerEvent } from '../../src/types.js'

const DEFAULT_THINKING_LEVEL = 2
const REPEATING: ReadonlySet<ButtonId> = new Set([
  'dpad_up',
  'dpad_down',
  'dpad_left',
  'dpad_right',
])

interface ControllerSource extends Pick<
  EventEmitter<{ data: [ControllerEvent] }>,
  'on' | 'removeListener'
> {
  start(): void
  stop(): void
}

export interface DesktopRuntimeOptions {
  controller?: ControllerSource
  harness?: Harness
  onStateChange?: () => void
}

/** Owns the controller-to-Codex event pipeline for the Electron process. */
export class DesktopRuntime {
  private readonly controller: ControllerSource
  private readonly harness: Harness
  private readonly repeater = new KeyRepeater()
  private readonly touchpad = new TouchpadGestureTracker()
  private readonly onStateChange: () => void
  private router: LayerRouter
  private config: OpenMicroConfig
  private thinkingLevel = DEFAULT_THINKING_LEVEL
  private started = false
  private paused = false
  private connected = false

  constructor(config: OpenMicroConfig, options: DesktopRuntimeOptions = {}) {
    this.config = config
    this.router = new LayerRouter(config)
    this.controller = options.controller ?? new HidManager()
    this.harness = options.harness ?? codexAppHarness
    this.onStateChange = options.onStateChange ?? (() => {})
  }

  get isPaused(): boolean {
    return this.paused
  }

  get isConnected(): boolean {
    return this.connected
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.controller.on('data', this.handleEvent)
    this.controller.start()
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.releaseOutput()
    this.controller.removeListener('data', this.handleEvent)
    this.controller.stop()
    this.connected = false
    this.onStateChange()
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    if (paused) this.releaseOutput()
    else this.router = new LayerRouter(this.config)
    this.onStateChange()
  }

  applyConfig(config: OpenMicroConfig): void {
    this.releaseOutput()
    this.config = config
    this.router = new LayerRouter(config)
    this.onStateChange()
  }

  private readonly handleEvent = (event: ControllerEvent): void => {
    if (event.kind === 'connected') {
      this.connected = true
      this.onStateChange()
      return
    }
    if (event.kind === 'disconnected') {
      this.connected = false
      this.releaseOutput()
      this.router = new LayerRouter(this.config)
      this.onStateChange()
      return
    }
    if (this.paused) return

    if (event.kind === 'touch') {
      const gesture = this.touchpad.update(event)
      if (gesture?.type === 'move') this.harness.movePointer?.(gesture.dx, gesture.dy)
      else if (gesture?.type === 'scroll') this.harness.scrollPointer?.(gesture.dx, gesture.dy)
      return
    }

    if (event.kind === 'button' && event.button === 'touchpad' && this.harness.clickPointer) {
      if (event.pressed) this.harness.clickPointer()
      return
    }

    const action = this.router.route(event)
    if (!action) return

    if (event.kind === 'button' && REPEATING.has(event.button) && action.type === 'keys') {
      if (event.pressed) this.repeater.press(event.button, () => this.dispatch(action))
      else this.repeater.release(event.button)
      return
    }
    if (action.type === 'push_to_talk' && event.kind === 'button') {
      this.dispatch({ ...action, pressed: event.pressed })
      return
    }
    if (event.kind === 'button' && !event.pressed) return
    this.dispatch(action)
  }

  private dispatch(action: Action): void {
    logger.info(`desktop action: ${action.type}`)
    const deps: DispatchDeps = {
      harness: this.harness,
      config: this.config,
      getThinkingLevel: () => this.thinkingLevel,
      setThinkingLevel: (level) => {
        this.thinkingLevel = level
      },
      write: (bytes) => this.harness.execute?.(bytes),
      focusSession: () => {},
      setLayer: (index) => this.router.setLayer(index),
      cycleHerdrSpace: () => {},
    }
    dispatchAction(action, deps)
  }

  private releaseOutput(): void {
    this.repeater.releaseAll()
    this.touchpad.reset()
    this.harness.dispose?.()
  }
}
