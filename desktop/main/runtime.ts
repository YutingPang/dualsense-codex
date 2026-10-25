import type { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { HidManager } from '../../src/controller/hid-manager.js'
import type { ControllerOutput } from '../../src/controller/output.js'
import { dispatchAction } from '../../src/dispatch.js'
import type { DispatchDeps } from '../../src/dispatch.js'
import { effectiveFocusIndex, feedbackFor } from '../../src/feedback.js'
import { codexAppHarness } from '../../src/harness/codex-app.js'
import type { Action, AgentState, Harness } from '../../src/harness/types.js'
import { KeyRepeater } from '../../src/keymap.js'
import type { OpenMicroConfig } from '../../src/layers.js'
import { logger } from '../../src/logger.js'
import { TouchpadGestureTracker } from '../../src/pointer.js'
import { LayerRouter } from '../../src/router.js'
import { HostServer } from '../../src/server.js'
import type { Aggregate } from '../../src/state.js'
import { nextFocus } from '../../src/state.js'
import { HOST_PORT } from '../../src/ports.js'
import type { ButtonId, ControllerEvent } from '../../src/types.js'

const DEFAULT_THINKING_LEVEL = 2
const FEEDBACK_DEBOUNCE_MS = 50

interface HapticPulse {
  intensity: number
  durationMs: number
  gapAfterMs: number
}

// Rumble only communicates a change that deserves attention. Running and
// resting are deliberately silent, and every new state cancels a stale pulse.
const HAPTIC_PATTERN: Partial<Record<AgentState, HapticPulse[]>> = {
  executing: [{ intensity: 0.22, durationMs: 250, gapAfterMs: 0 }],
  waiting: [
    { intensity: 0.5, durationMs: 120, gapAfterMs: 90 },
    { intensity: 0.5, durationMs: 120, gapAfterMs: 0 },
  ],
  complete: [{ intensity: 0.28, durationMs: 750, gapAfterMs: 0 }],
  error: [
    { intensity: 0.65, durationMs: 100, gapAfterMs: 75 },
    { intensity: 0.65, durationMs: 100, gapAfterMs: 75 },
    { intensity: 0.65, durationMs: 100, gapAfterMs: 0 },
  ],
}
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
  readonly output?: ControllerOutput
  start(): void
  stop(): void
}

interface StatusServer {
  readonly tracker: {
    list(): { id: string; state: import('../../src/harness/types.js').AgentState; order: number }[]
    aggregate(): Aggregate
  }
  listen(port: number): Promise<boolean>
  close(): void
  on(event: 'aggregate', listener: (aggregate: Aggregate) => void): unknown
}

export interface DesktopRuntimeOptions {
  controller?: ControllerSource
  harness?: Harness
  onStateChange?: () => void
  onPlayStation?: () => void
  /** Injectable for tests. `null` disables lifecycle status tracking. */
  statusServer?: StatusServer | null
}

/** Owns the controller-to-Codex event pipeline for the Electron process. */
export class DesktopRuntime {
  private readonly controller: ControllerSource
  private readonly harness: Harness
  private readonly repeater = new KeyRepeater()
  private readonly touchpad = new TouchpadGestureTracker()
  private readonly onStateChange: () => void
  private readonly onPlayStation: () => void
  private readonly statusServer: StatusServer | null
  private router: LayerRouter
  private config: OpenMicroConfig
  private thinkingLevel = DEFAULT_THINKING_LEVEL
  private started = false
  private paused = false
  private connected = false
  private statusHost = false
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null
  private hapticTimers: ReturnType<typeof setTimeout>[] = []
  private focusSessionId: string | null = null
  private lastAttentionId: string | null = null
  private lastHapticState: AgentState | null = null

  constructor(config: OpenMicroConfig, options: DesktopRuntimeOptions = {}) {
    this.config = config
    this.router = new LayerRouter(config)
    this.controller = options.controller ?? new HidManager()
    this.harness = options.harness ?? codexAppHarness
    this.onStateChange = options.onStateChange ?? (() => {})
    this.onPlayStation = options.onPlayStation ?? (() => {})
    this.statusServer =
      options.statusServer === undefined
        ? new HostServer(this.harness, randomUUID())
        : options.statusServer
    this.statusServer?.on('aggregate', this.handleAggregate)
    this.router.onLayerChange = this.scheduleFeedback
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
    this.harness.installHooks()
    if (this.statusServer) {
      void this.statusServer
        .listen(HOST_PORT)
        .then((isHost) => {
          if (!this.started) {
            if (isHost) this.statusServer?.close()
            return
          }
          this.statusHost = isHost
          if (!isHost)
            logger.warn('status server port is already in use; desktop LEDs are local-only')
          this.scheduleFeedback()
        })
        .catch((err) => logger.error('desktop status server failed', err))
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return
    this.started = false
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer)
    this.feedbackTimer = null
    if (this.statusHost) this.statusServer?.close()
    this.statusHost = false
    this.releaseHeldEffects()
    this.controller.removeListener('data', this.handleEvent)
    this.controller.stop()
    this.connected = false
    this.onStateChange()
    // The GUI harness cancels queued synthetic chords and releases held keys;
    // quitting must wait for that or a late `key down` strands a modifier.
    await this.disposeHarness().catch((error: unknown) =>
      logger.warn('harness cleanup failed', error),
    )
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    if (paused) this.releaseOutput()
    else this.resetRouter()
    this.scheduleFeedback()
    this.onStateChange()
  }

  applyConfig(config: OpenMicroConfig): void {
    this.releaseOutput()
    this.config = config
    this.resetRouter()
    this.scheduleFeedback()
    this.onStateChange()
  }

  private readonly handleEvent = (event: ControllerEvent): void => {
    if (event.kind === 'connected') {
      this.connected = true
      this.scheduleFeedback()
      this.onStateChange()
      return
    }
    if (event.kind === 'disconnected') {
      this.connected = false
      this.releaseOutput()
      this.resetRouter()
      this.onStateChange()
      return
    }
    if (event.kind === 'system') {
      if (event.control === 'playstation' && event.pressed) this.onPlayStation()
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
      focusSession: (index) => this.focusSession(index),
      setLayer: (index) => this.router.setLayer(index),
      cycleHerdrSpace: () => {},
    }
    dispatchAction(action, deps)
  }

  private releaseOutput(): void {
    this.releaseHeldEffects()
    void this.disposeHarness().catch((error: unknown) =>
      logger.warn('harness cleanup failed', error),
    )
  }

  /** Stop timers/repeats and forget touch state (no harness I/O). */
  private releaseHeldEffects(): void {
    this.stopHaptics()
    this.repeater.releaseAll()
    this.touchpad.reset()
  }

  private async disposeHarness(): Promise<void> {
    await this.harness.dispose?.()
  }

  private resetRouter(): void {
    this.router = new LayerRouter(this.config)
    this.router.onLayerChange = this.scheduleFeedback
  }

  private readonly handleAggregate = (aggregate: Aggregate): void => {
    const next = nextFocus(this.focusSessionId, this.lastAttentionId, aggregate)
    this.focusSessionId = next.focus
    this.lastAttentionId = next.lastAttentionId
    this.playStateHaptic(aggregate)
    this.scheduleFeedback()
  }

  private focusSession(index: number): void {
    const sessions = this.statusServer?.tracker.list() ?? []
    if (sessions.length === 0) return
    if (index < 0) {
      const current = sessions.findIndex((session) => session.id === this.focusSessionId)
      this.focusSessionId = sessions[(current + 1) % sessions.length]?.id ?? null
    } else {
      this.focusSessionId = sessions[index]?.id ?? this.focusSessionId
    }
    this.scheduleFeedback()
  }

  private readonly scheduleFeedback = (): void => {
    if (this.feedbackTimer || this.paused || !this.connected) return
    this.feedbackTimer = setTimeout(() => {
      this.feedbackTimer = null
      const sessions = this.statusServer?.tracker.list() ?? []
      const attentionId = this.statusServer?.tracker.aggregate().focusSessionId ?? null
      const focusedIndex = effectiveFocusIndex(sessions, this.focusSessionId, attentionId)
      const layerColor = this.config.layers[this.router.currentLayer]?.color ?? { r: 0, g: 0, b: 0 }
      const feedback = feedbackFor(sessions, focusedIndex, layerColor)
      this.controller.output?.setLightbar(feedback.lightbar)
      this.controller.output?.setPlayerLeds(feedback.playerLeds)
    }, FEEDBACK_DEBOUNCE_MS)
    this.feedbackTimer.unref?.()
  }

  private playStateHaptic(aggregate: Aggregate): void {
    const sessions = this.statusServer?.tracker.list() ?? []
    const focusedIndex = effectiveFocusIndex(
      sessions,
      this.focusSessionId,
      aggregate.focusSessionId,
    )
    const state = sessions[focusedIndex]?.state ?? null
    if (state === this.lastHapticState) return
    this.lastHapticState = state
    this.stopHaptics()
    const pattern = state ? HAPTIC_PATTERN[state] : undefined
    if (!pattern || this.paused || !this.connected) return

    let offsetMs = 0
    for (const pulse of pattern) {
      this.scheduleHaptic(offsetMs, pulse.intensity)
      offsetMs += pulse.durationMs
      this.scheduleHaptic(offsetMs, 0)
      offsetMs += pulse.gapAfterMs
    }
  }

  private scheduleHaptic(delayMs: number, intensity: number): void {
    if (delayMs === 0) {
      this.controller.output?.setRumble(intensity)
      return
    }
    const timer = setTimeout(() => {
      this.hapticTimers = this.hapticTimers.filter((pending) => pending !== timer)
      this.controller.output?.setRumble(intensity)
    }, delayMs)
    timer.unref?.()
    this.hapticTimers.push(timer)
  }

  private stopHaptics(): void {
    for (const timer of this.hapticTimers) clearTimeout(timer)
    this.hapticTimers = []
    this.controller.output?.setRumble(0)
  }
}
