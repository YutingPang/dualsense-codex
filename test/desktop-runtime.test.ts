import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DesktopRuntime } from '../desktop/main/runtime.js'
import type { Harness } from '../src/harness/types.js'
import { DEFAULT_CONFIG } from '../src/layers.js'
import type { ControllerEvent } from '../src/types.js'

class FakeController extends EventEmitter<{ data: [ControllerEvent] }> {
  start = vi.fn()
  stop = vi.fn()

  send(event: ControllerEvent): void {
    this.emit('data', event)
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
  const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), { controller, harness })
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

  it('keeps the PlayStation key out of normal bindings and forwards its press to wake Codex', () => {
    const controller = new FakeController()
    const onPlayStation = vi.fn()
    const runtime = new DesktopRuntime(structuredClone(DEFAULT_CONFIG), {
      controller,
      onPlayStation,
    })
    runtime.start()
    controller.send({ kind: 'system', control: 'playstation', pressed: true })
    controller.send({ kind: 'system', control: 'playstation', pressed: false })
    expect(onPlayStation).toHaveBeenCalledOnce()
  })
})
