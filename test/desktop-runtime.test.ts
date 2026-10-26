import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopRuntime } from '../desktop/main/runtime.js'
import type { Harness } from '../src/harness/types.js'
import { DEFAULT_CONFIG } from '../src/layers.js'
import { SessionTracker } from '../src/state.js'
import type { Aggregate } from '../src/state.js'
import type { ControllerEvent } from '../src/types.js'

class FakeController extends EventEmitter<{ data: [ControllerEvent] }> {
  start = vi.fn()
  stop = vi.fn()
  output = {
    setLightbar: vi.fn(),
    setPlayerLeds: vi.fn(),
    setRumble: vi.fn(),
  }

  send(event: ControllerEvent): void {
    this.emit('data', event)
  }
}

class FakeStatusServer extends EventEmitter<{ aggregate: [Aggregate] }> {
  tracker = new SessionTracker()
  listen = vi.fn(async () => true)
  close = vi.fn()

  apply(sessionId: string, state: Parameters<SessionTracker['apply']>[1]): void {
    this.tracker.apply(sessionId, state, { focusOnStop: true })
    this.emit('aggregate', this.tracker.aggregate())
  }
}

function setup() {
  const controller = new FakeController()
  const execute = vi.fn()
  const dispose = vi.fn()
  const harness: Harness = {
    kind: 'codex-app',
    usesPty: false,
    command: 'open',
    buildArgs: () => [],
    installHooks: () => ({ changed: false, trustNotice: null }),
    stateForHookEvent: () => null,
    resolveAction: (action) => {
      if (action.type === 'accept') return { bytes: 'accept' }
      if (action.type === 'reject') return { bytes: 'reject' }
      if (action.type === 'push_to_talk') return { bytes: action.pressed ? 'talk-on' : 'talk-off' }
      return null
    },
    execute,
    dispose,
  }
  const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), {
    controller,
    harness,
    statusServer: null,
  })
  runtime.start()
  return { controller, dispose, execute, runtime }
}

describe('DesktopRuntime', () => {
  it('routes controller presses and held-action releases to the desktop harness', () => {
    const { controller, execute } = setup()
    controller.send({ kind: 'button', button: 'south', pressed: true })
    controller.send({ kind: 'button', button: 'north', pressed: true })
    controller.send({ kind: 'button', button: 'north', pressed: false })
    expect(execute.mock.calls.flat()).toEqual(['accept', 'talk-on', 'talk-off'])
  })

  it('pauses output, releases held effects, and resumes with fresh routing state', () => {
    const { controller, dispose, execute, runtime } = setup()
    controller.send({ kind: 'button', button: 'north', pressed: true })
    runtime.setPaused(true)
    controller.send({ kind: 'button', button: 'south', pressed: true })
    expect(dispose).toHaveBeenCalledOnce()
    expect(execute.mock.calls.flat()).toEqual(['talk-on'])

    runtime.setPaused(false)
    controller.send({ kind: 'button', button: 'south', pressed: true })
    expect(execute.mock.calls.flat()).toEqual(['talk-on', 'accept'])
  })

  it('applies new bindings without restarting the controller', () => {
    const { controller, execute, runtime } = setup()
    const config = structuredClone(DEFAULT_CONFIG)
    config.layers[0]!.bindings.south = { type: 'reject' }
    runtime.applyConfig(config)
    controller.send({ kind: 'button', button: 'south', pressed: true })
    expect(execute).toHaveBeenCalledWith('reject')
    expect(controller.start).toHaveBeenCalledOnce()
  })

  it('cleans up output and connection state on disconnect and stop', () => {
    const { controller, dispose, runtime } = setup()
    controller.send({ kind: 'connected', controllerType: 'dualsense' })
    expect(runtime.isConnected).toBe(true)
    controller.send({ kind: 'disconnected' })
    expect(runtime.isConnected).toBe(false)
    expect(dispose).toHaveBeenCalledOnce()
    runtime.stop()
    expect(controller.stop).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledTimes(2)
  })

  it('waits for async harness cleanup before stop resolves', async () => {
    const controller = new FakeController()
    let finish: () => void = () => {}
    const dispose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const harness: Harness = {
      kind: 'codex-app',
      usesPty: false,
      command: 'open',
      buildArgs: () => [],
      installHooks: () => ({ changed: false, trustNotice: null }),
      stateForHookEvent: () => null,
      resolveAction: () => null,
      execute: vi.fn(),
      dispose,
    }
    const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), {
      controller,
      harness,
      statusServer: null,
    })
    runtime.start()

    let settled = false
    const stopping = runtime.stop().then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(dispose).toHaveBeenCalledOnce()
    expect(settled).toBe(false) // still waiting for queued chords to drain

    finish()
    await stopping
    expect(settled).toBe(true)
  })

  it('keeps the PlayStation key out of normal bindings and forwards its press to wake Codex', () => {
    const controller = new FakeController()
    const onPlayStation = vi.fn()
    const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), {
      controller,
      onPlayStation,
      statusServer: null,
    })
    runtime.start()
    controller.send({ kind: 'system', control: 'playstation', pressed: true })
    controller.send({ kind: 'system', control: 'playstation', pressed: false })
    expect(onPlayStation).toHaveBeenCalledOnce()
  })

  it('mirrors lifecycle state and occupied sessions to DualSense LEDs', async () => {
    vi.useFakeTimers()
    try {
      const controller = new FakeController()
      const statusServer = new FakeStatusServer()
      const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), {
        controller,
        statusServer,
      })
      runtime.start()
      controller.send({ kind: 'connected', controllerType: 'dualsense' })

      statusServer.apply('task-1', 'executing')
      expect(controller.output.setRumble).toHaveBeenLastCalledWith(0.22)
      await vi.advanceTimersByTimeAsync(50)
      expect(controller.output.setLightbar).toHaveBeenLastCalledWith({ r: 0, g: 0, b: 255 })
      expect(controller.output.setPlayerLeds).toHaveBeenLastCalledWith(0b00001)
      await vi.advanceTimersByTimeAsync(200)
      expect(controller.output.setRumble).toHaveBeenLastCalledWith(0)

      controller.output.setRumble.mockClear()
      statusServer.apply('task-2', 'waiting')
      expect(controller.output.setRumble).toHaveBeenLastCalledWith(0.5)
      await vi.advanceTimersByTimeAsync(330)
      expect(controller.output.setRumble.mock.calls.map(([intensity]) => intensity)).toEqual([
        0, 0.5, 0, 0.5, 0,
      ])
      await vi.advanceTimersByTimeAsync(50)
      expect(controller.output.setLightbar).toHaveBeenLastCalledWith({ r: 255, g: 176, b: 0 })
      expect(controller.output.setPlayerLeds).toHaveBeenLastCalledWith(0b00011)

      statusServer.apply('task-2', 'complete')
      expect(controller.output.setRumble).toHaveBeenLastCalledWith(0.28)
      await vi.advanceTimersByTimeAsync(750)
      expect(controller.output.setRumble).toHaveBeenLastCalledWith(0)
      await vi.advanceTimersByTimeAsync(50)
      expect(controller.output.setLightbar).toHaveBeenLastCalledWith({ r: 0, g: 255, b: 0 })

      runtime.stop()
      await Promise.resolve()
      expect(statusServer.close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
