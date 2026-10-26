// Device detection, driver factory, and reconnect lifecycle. Exposes a single
// deduplicated ControllerEvent stream regardless of which driver is active.

import { EventEmitter } from 'node:events'
import { devices as hidDevices } from 'node-hid'
import type { Device } from 'node-hid'
import { logger } from '../logger.js'
import { Deduper } from './hal.js'
import type { ControllerHAL } from './hal.js'
import type { ControllerOutput } from './output.js'
import { DualSenseDriver } from './dualsense-driver.js'
import { DS4_PIDS, DS4_VID, parseDs4Report } from './ds4-driver.js'
import { GAMESIR_PIDS, GAMESIR_VID, parseGameSirReport } from './gamesir-driver.js'
import { parseGenericReport } from './generic-driver.js'
import { RawHidDriver } from './raw-hid-driver.js'
import {
  parseXboxBtReport,
  parseXboxGipReport,
  parseXboxReport,
  XBOX_BT_PIDS,
  XBOX_GIP_PIDS,
  XBOX_PIDS,
  XBOX_VID,
} from './xbox-driver.js'
import type { ControllerEvent } from '../types.js'

export const DUALSENSE_VID = 0x054c
export const DUALSENSE_PIDS = [0x0ce6, 0x0df2] // DualSense, DualSense Edge

const RECONNECT_POLL_MS = 2000

// A device can enumerate yet never connect: another process owns it, the
// provider's fixed product id does not match, or the connection raced an
// unplug. Without this timeout the manager waits forever for a `disconnected`
// event that never comes, leaving the app silently controller-less.
const CONNECT_TIMEOUT_MS = 2000

export type DriverFactory = () => ControllerHAL | null

/** Detect the best matching device: DualSense > DS4 > Xbox > GameSir > generic gamepad. */
export function createDriver(): ControllerHAL | null {
  let devices: Device[]
  try {
    devices = hidDevices()
  } catch (err) {
    logger.error('HID enumeration failed', err)
    return null
  }

  const dualSense = devices.find(
    (d) => d.vendorId === DUALSENSE_VID && DUALSENSE_PIDS.includes(d.productId),
  )
  if (dualSense) {
    // Pass the detected PID: dualsense-ts enumerates a fixed product id, so an
    // Edge (0x0df2) is invisible unless the provider is pointed at it.
    return new DualSenseDriver(dualSense.productId)
  }
  const ds4 = devices.find((d) => d.vendorId === DS4_VID && DS4_PIDS.includes(d.productId))
  if (ds4?.path) {
    return new RawHidDriver('ds4', ds4.path, parseDs4Report)
  }
  const xbox = devices.find((d) => d.vendorId === XBOX_VID && XBOX_PIDS.includes(d.productId))
  if (xbox?.path) {
    return new RawHidDriver('xbox', xbox.path, parseXboxReport)
  }
  const xboxGip = devices.find(
    (d) => d.vendorId === XBOX_VID && XBOX_GIP_PIDS.includes(d.productId),
  )
  if (xboxGip?.path) {
    return new RawHidDriver('xbox', xboxGip.path, parseXboxGipReport)
  }
  const xboxBt = devices.find((d) => d.vendorId === XBOX_VID && XBOX_BT_PIDS.includes(d.productId))
  if (xboxBt?.path) {
    return new RawHidDriver('xbox', xboxBt.path, parseXboxBtReport)
  }
  const gamesir = devices.find(
    (d) => d.vendorId === GAMESIR_VID && GAMESIR_PIDS.includes(d.productId),
  )
  if (gamesir?.path) {
    return new RawHidDriver('gamesir', gamesir.path, parseGameSirReport)
  }
  const generic = devices.find(
    (d) => d.usagePage === 0x01 && (d.usage === 0x04 || d.usage === 0x05) && d.path,
  )
  if (generic?.path) {
    logger.warn('Unknown controller, using generic HID driver')
    return new RawHidDriver('generic-hid', generic.path, parseGenericReport)
  }
  return null
}

/**
 * Emits deduplicated ControllerEvents on 'data'. Polls for a controller until
 * one appears, and resumes polling after a disconnect — plugging a controller
 * in or waking it mid-session just works. A detected device that never connects
 * (busy, unsupported PID, unplug race) is retried after CONNECT_TIMEOUT_MS.
 */
export class HidManager extends EventEmitter<{ data: [ControllerEvent] }> {
  private driver: ControllerHAL | null = null
  private deduper = new Deduper()
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private attachTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  private pollLogged = false
  private attachFailureLogged = false

  /**
   * Args:
   *     driverFactory (DriverFactory): Injected device probe (tests only).
   *         Defaults to createDriver().
   */
  constructor(private readonly driverFactory: DriverFactory = createDriver) {
    super()
  }

  /** Live output surface of the active driver (DualSense only), or undefined. */
  get output(): ControllerOutput | undefined {
    return this.driver?.output
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.pollLogged = false
    this.attachFailureLogged = false
    this.attach()
  }

  stop(): void {
    this.stopped = true
    this.clearPollTimer()
    this.clearAttachTimer()
    this.driver?.stop()
    this.driver = null
  }

  private attach(prepared?: ControllerHAL): void {
    if (this.stopped) return

    let candidate = prepared ?? null
    if (!candidate) {
      try {
        candidate = this.driverFactory()
      } catch (err) {
        logger.error('controller detection failed', err)
        this.pollUntilFound()
        return
      }
    }
    if (!candidate) {
      this.pollUntilFound()
      return
    }

    const driver = candidate
    this.driver = driver
    this.deduper = new Deduper()
    let connected = false

    driver.on('data', (e: ControllerEvent) => {
      // Late events from a driver we already replaced must not tear down the
      // current one (the old code stopped `this.driver`, whichever it was).
      if (this.driver !== driver) return
      if (e.kind === 'connected') {
        connected = true
        this.attachFailureLogged = false
        this.pollLogged = false
        this.clearAttachTimer()
      }
      const filtered = this.deduper.filter(e)
      if (!filtered) return
      this.emit('data', filtered)
      if (filtered.kind !== 'disconnected') return
      this.clearAttachTimer()
      driver.stop()
      this.driver = null
      this.pollUntilFound()
    })

    try {
      driver.start()
    } catch (err) {
      logger.error('controller driver failed to start', err)
      if (this.driver === driver) {
        this.driver = null
        driver.stop()
        this.pollUntilFound()
      }
      return
    }

    // Drivers may connect synchronously (raw HID), fail synchronously (the
    // disconnect above), or stay silent (the timeout below).
    if (connected || this.driver !== driver) return

    this.attachTimer = setTimeout(() => {
      this.attachTimer = null
      if (this.stopped || this.driver !== driver || connected) return
      if (!this.attachFailureLogged) {
        this.attachFailureLogged = true
        logger.warn(
          `controller detected but did not connect within ${CONNECT_TIMEOUT_MS / 1000}s — retrying (another app may own the device)`,
        )
      }
      driver.stop()
      this.driver = null
      this.pollUntilFound()
    }, CONNECT_TIMEOUT_MS)
    this.attachTimer.unref?.()
  }

  private pollUntilFound(): void {
    if (this.pollTimer || this.stopped) return
    if (!this.pollLogged) {
      this.pollLogged = true
      logger.info('No controller found — polling')
    }
    this.pollTimer = setInterval(() => {
      if (this.stopped) return
      let found: ControllerHAL | null = null
      try {
        found = this.driverFactory()
      } catch (err) {
        logger.error('controller detection failed', err)
        return
      }
      if (!found) return
      this.clearPollTimer()
      this.attach(found)
    }, RECONNECT_POLL_MS)
    this.pollTimer.unref()
  }

  private clearPollTimer(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private clearAttachTimer(): void {
    if (this.attachTimer) clearTimeout(this.attachTimer)
    this.attachTimer = null
  }
}
