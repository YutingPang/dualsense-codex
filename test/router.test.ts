import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/layers.js'
import type { ControlId, Layer, OpenMicroConfig } from '../src/layers.js'
import { GUARD_WINDOW_MS, LayerRouter } from '../src/router.js'
import type { Action } from '../src/harness/types.js'
import type { AxisId, ButtonId, ControllerEvent } from '../src/types.js'

function press(button: ButtonId): ControllerEvent {
  return { kind: 'button', button, pressed: true }
}
function release(button: ButtonId): ControllerEvent {
  return { kind: 'button', button, pressed: false }
}
function axis(axisId: AxisId, value: number): ControllerEvent {
  return { kind: 'axis', axis: axisId, value }
}

function layer(name: string, bindings: Partial<Record<ControlId, Action>> = {}): Layer {
  return { name, color: { r: 0, g: 0, b: 0 }, bindings }
}

function makeConfig(overrides: Partial<Record<number, Layer>> = {}): OpenMicroConfig {
  const layers = [0, 1, 2, 3, 4, 5].map(
    (i) => overrides[i] ?? layer(`Layer ${i + 1}`),
  ) as OpenMicroConfig['layers']
  return { layers, workflows: {} }
}

function makeRouter(config: OpenMicroConfig): { router: LayerRouter; tick: (ms: number) => void } {
  let now = 0
  const router = new LayerRouter(config, { now: () => now })
  return { router, tick: (ms) => (now += ms) }
}

describe('LayerRouter: layer switching', () => {
  it('l1 + south/east/west/north/dpad_up/dpad_down jumps to layers 0-5', () => {
    const config = makeConfig()
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    const cases: [ButtonId, number][] = [
      ['south', 0],
      ['east', 1],
      ['west', 2],
      ['north', 3],
      ['dpad_up', 4],
      ['dpad_down', 5],
    ]
    for (const [button, index] of cases) {
      router.route(press('l1'))
      router.route(press(button))
      expect(router.currentLayer).toBe(index)
      router.route(release(button))
      router.route(release('l1'))
      tick(GUARD_WINDOW_MS + 1)
    }
  })

  it('the l1-held press is consumed, never routed as a binding', () => {
    const config = makeConfig({ 0: layer('Layer 1', { south: { type: 'accept' } }) })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('l1'))
    expect(router.route(press('south'))).toBeNull()
  })

  it('l1 release never routes to an Action, before or after a switch', () => {
    const config = makeConfig()
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('l1'))
    router.route(press('east'))
    tick(GUARD_WINDOW_MS + 1)
    expect(router.route(release('l1'))).toBeNull()
  })

  it('fires onLayerChange only when the layer actually changes', () => {
    const config = makeConfig()
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)
    const seen: number[] = []
    router.onLayerChange = (index) => seen.push(index)

    router.route(press('l1'))
    router.route(press('east')) // 0 -> 1
    router.route(release('east'))
    tick(GUARD_WINDOW_MS + 1)
    router.route(press('east')) // already on layer 1: no-op, must not fire again
    router.route(release('east'))
    tick(GUARD_WINDOW_MS + 1)
    router.route(release('l1'))

    expect(seen).toEqual([1])
  })

  it('swallows all button edges during the 750ms guard window after a switch', () => {
    const config = makeConfig({ 1: layer('Layer 2', { south: { type: 'accept' } }) })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('l1'))
    router.route(press('east')) // -> layer 1
    router.route(release('east'))
    router.route(release('l1'))

    expect(router.route(press('south'))).toBeNull() // inside guard window
    tick(GUARD_WINDOW_MS + 1)
    expect(router.route(press('south'))).toEqual({ type: 'accept' })
  })

  it('a button held across the flip stays dead until released and freshly re-pressed', () => {
    const config = makeConfig({
      0: layer('Layer 1', { south: { type: 'accept' } }),
      1: layer('Layer 2', { south: { type: 'reject' } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    // south is held down in layer 0 when l1+east flips to layer 1.
    router.route(press('south'))
    router.route(press('l1'))
    router.route(press('east'))
    router.route(release('east'))
    router.route(release('l1'))
    tick(GUARD_WINDOW_MS + 1)

    // A duplicate press stays dead, but release returns the original action
    // so the caller can stop any repeat or held chord that press started.
    expect(router.route(press('south'))).toBeNull()
    expect(router.route(release('south'))).toEqual({ type: 'accept' })

    // A fresh press after release works normally.
    expect(router.route(press('south'))).toEqual({ type: 'reject' })
  })

  it('releases the action started before a layer switch instead of the new binding', () => {
    const config = makeConfig({
      0: layer('Layer 1', { north: { type: 'push_to_talk' } }),
      1: layer('Layer 2', { north: { type: 'reject' } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    expect(router.route(press('north'))).toEqual({ type: 'push_to_talk' })
    router.route(press('l1'))
    router.route(press('east'))

    expect(router.route(release('north'))).toEqual({ type: 'push_to_talk' })
  })

  it('the held-accept race: a press held through the flip cannot fire, but a fresh one can', () => {
    const config = makeConfig({ 1: layer('Layer 2', { south: { type: 'accept' } }) })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('south')) // mashing south in layer 0 (unbound, does nothing)
    router.route(press('l1'))
    router.route(press('east')) // question appears mid-press: flips to layer 1
    router.route(release('east'))
    router.route(release('l1'))
    tick(GUARD_WINDOW_MS + 1)

    expect(router.route(release('south'))).toBeNull()
    expect(router.route(press('south'))).toEqual({ type: 'accept' }) // fresh press is intentional
  })
})

describe('LayerRouter: binding lookup', () => {
  it('routes a bound button to its Action', () => {
    const config = makeConfig({ 0: layer('Layer 1', { south: { type: 'accept' } }) })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)
    expect(router.route(press('south'))).toEqual({ type: 'accept' })
  })

  it('returns null for an unbound control', () => {
    const config = makeConfig()
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)
    expect(router.route(press('south'))).toBeNull()
  })

  it('the default config is fully wired: south/east/west/north', () => {
    const { router, tick } = makeRouter(DEFAULT_CONFIG)
    tick(GUARD_WINDOW_MS + 1)
    expect(router.route(press('south'))).toEqual({ type: 'accept' })
    expect(router.route(press('east'))).toEqual({ type: 'clear_input' })
    expect(router.route(press('north'))).toEqual({ type: 'push_to_talk' })
    expect(router.route(press('west'))).toEqual({ type: 'new_chat' })
  })
})

describe('LayerRouter: stick flick', () => {
  it('fires the direction once on a clean flick', () => {
    const config = makeConfig({
      0: layer('Layer 1', { lstick_up: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    expect(router.route(axis('left_y', -0.9))).toBeNull() // armed, not yet fired
    expect(router.route(axis('left_y', -0.1))).toEqual({ type: 'thinking_depth', delta: 1 })
    // Firing again requires re-crossing the threshold.
    expect(router.route(axis('left_y', -0.1))).toBeNull()
  })

  it('does not fire when the return-to-center happens outside the 250ms window', () => {
    const config = makeConfig({
      0: layer('Layer 1', { lstick_up: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(axis('left_y', -0.9))
    tick(300)
    expect(router.route(axis('left_y', -0.1))).toBeNull()
  })

  it('picks the dominant axis for a diagonal flick', () => {
    const config = makeConfig({
      0: layer('Layer 1', {
        lstick_right: { type: 'thinking_depth', delta: 1 },
        lstick_up: { type: 'thinking_depth', delta: -1 },
      }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(axis('left_x', 0.9))
    router.route(axis('left_y', -0.2)) // x dominates
    expect(router.route(axis('left_x', 0.1))).toEqual({ type: 'thinking_depth', delta: 1 })
  })

  it('does not fire a flick for a stick that is mid-rotation', () => {
    const config = makeConfig({
      0: layer('Layer 1', {
        rstick_up: { type: 'thinking_depth', delta: 1 },
        rstick_right: { type: 'thinking_depth', delta: 1 },
        rstick_cw: { type: 'reject' },
      }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    const point = (deg: number) => ({
      x: Math.cos((deg * Math.PI) / 180),
      y: Math.sin((deg * Math.PI) / 180),
    })
    const results: (Action | null)[] = []
    for (const deg of [0, 30, 60, 95]) {
      const { x, y } = point(deg)
      results.push(router.route(axis('right_x', x)))
      results.push(router.route(axis('right_y', y)))
    }
    // Only the 90-degree rotation tick should have emitted anything.
    expect(results.filter((r) => r !== null)).toEqual([{ type: 'reject' }])
  })
})

describe('LayerRouter: stick rotation', () => {
  const point = (deg: number) => ({
    x: Math.cos((deg * Math.PI) / 180),
    y: Math.sin((deg * Math.PI) / 180),
  })

  function sweep(
    router: LayerRouter,
    side: 'left' | 'right',
    degrees: number[],
  ): (Action | null)[] {
    const results: (Action | null)[] = []
    for (const deg of degrees) {
      const { x, y } = point(deg)
      results.push(router.route(axis(`${side}_x` as AxisId, x)))
      results.push(router.route(axis(`${side}_y` as AxisId, y)))
    }
    return results
  }

  it('emits one cw tick per 90 degrees of clockwise sweep', () => {
    const config = makeConfig({
      0: layer('Layer 1', { rstick_cw: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    // Overshoot slightly past 90 to stay clear of floating-point boundary flakiness.
    const results = sweep(router, 'right', [0, 30, 60, 95])
    expect(results.filter((r) => r !== null)).toEqual([{ type: 'thinking_depth', delta: 1 }])
  })

  it('emits one ccw tick per 90 degrees of counter-clockwise sweep', () => {
    const config = makeConfig({
      0: layer('Layer 1', { rstick_ccw: { type: 'thinking_depth', delta: -1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    const results = sweep(router, 'right', [0, -30, -60, -95])
    expect(results.filter((r) => r !== null)).toEqual([{ type: 'thinking_depth', delta: -1 }])
  })

  it('emits multiple ticks in one continuous sweep', () => {
    const config = makeConfig({
      0: layer('Layer 1', { rstick_cw: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    // 0 -> 250 degrees in 25-degree steps: two full 90-degree crossings (90, 180).
    const degrees = Array.from({ length: 11 }, (_, i) => i * 25)
    const results = sweep(router, 'right', degrees)
    expect(results.filter((r) => r !== null)).toEqual([
      { type: 'thinking_depth', delta: 1 },
      { type: 'thinking_depth', delta: 1 },
    ])
  })

  it('resets the accumulator once magnitude drops below 0.4', () => {
    const config = makeConfig({
      0: layer('Layer 1', { rstick_cw: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    // Sweep 60 degrees (below the 90-degree step), then drop under 0.4 to reset.
    let results = sweep(router, 'right', [0, 30, 60])
    expect(results.every((r) => r === null)).toBe(true)
    router.route(axis('right_x', 0.1))
    router.route(axis('right_y', 0))

    // Resume from a fresh angle: 60 degrees post-reset must not fire (would
    // have if the old 60 degrees had leaked through, since 60+60 > 90).
    results = sweep(router, 'right', [0, 60])
    expect(results.every((r) => r === null)).toBe(true)

    // Completing to 95 degrees post-reset fires exactly one tick.
    const { x, y } = point(95)
    const last = [router.route(axis('right_x', x)), router.route(axis('right_y', y))]
    expect(last.filter((r) => r !== null)).toEqual([{ type: 'thinking_depth', delta: 1 }])
  })

  it('gesture emissions are swallowed during the guard window', () => {
    const config = makeConfig({
      0: layer('Layer 1', { rstick_cw: { type: 'thinking_depth', delta: 1 } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('l1'))
    router.route(press('east')) // switch layer, opens guard window
    router.route(release('east'))
    router.route(release('l1'))

    const results = sweep(router, 'right', [0, 30, 60, 90])
    expect(results.every((r) => r === null)).toBe(true)
  })
})

describe('LayerRouter: L1 binding lifecycle', () => {
  it('releases an L1 press made on a layer that no longer binds it', () => {
    const config = makeConfig({
      0: layer('Layer 1', { l1: { type: 'push_to_talk' } }),
      1: layer('Layer 2'),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    expect(router.route(press('l1'))).toEqual({ type: 'push_to_talk' })
    router.setLayer(1)
    // The release must resolve the action its own press started, or the
    // Control+Shift+D chord stays held.
    expect(router.route(release('l1'))).toEqual({ type: 'push_to_talk' })
  })

  it('does not leave the layer modifier latched when L1 gains a binding mid-hold', () => {
    const config = makeConfig({
      // L1 starts as the bare modifier, then the layer we flip into binds it.
      0: layer('Layer 1'),
      1: layer('Layer 2', { l1: { type: 'accept' } }),
    })
    const { router, tick } = makeRouter(config)
    tick(GUARD_WINDOW_MS + 1)

    router.route(press('l1')) // unbound: l1Held = true
    router.route(press('east')) // l1 + east jumps to layer 1
    router.route(release('east'))
    tick(GUARD_WINDOW_MS + 1)
    router.route(release('l1')) // old code left l1Held true here

    // With the modifier still latched, south would jump back to layer 0.
    router.route(press('south'))
    expect(router.currentLayer).toBe(1)
  })
})
