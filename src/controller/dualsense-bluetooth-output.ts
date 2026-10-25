import { computeBluetoothReportChecksum, HIDProvider, NodeHIDProvider } from 'dualsense-ts'

const BLUETOOTH_REPORT_ID = 0x31
const BLUETOOTH_REPORT_LENGTH = 78
const BLUETOOTH_OUTPUT_TAG = 0x10
const COMMON_PAYLOAD_LENGTH = 47
const SOURCE_COMMON_OFFSET = 2
const TARGET_COMMON_OFFSET = 3

const VALID_FLAG2_OFFSET = TARGET_COMMON_OFFSET + 38
const LIGHTBAR_SETUP_OFFSET = TARGET_COMMON_OFFSET + 41
const LIGHTBAR_SETUP_ENABLE = 0x02
const LIGHTBAR_SETUP_LIGHT_OUT = 0x02

function finalize(report: Uint8Array): Uint8Array {
  const crc = computeBluetoothReportChecksum(report)
  report[74] = crc & 0xff
  report[75] = (crc >>> 8) & 0xff
  report[76] = (crc >>> 16) & 0xff
  report[77] = (crc >>> 24) & 0xff
  return report
}

function header(sequence: number): Uint8Array {
  const report = new Uint8Array(BLUETOOTH_REPORT_LENGTH)
  report[0] = BLUETOOTH_REPORT_ID
  report[1] = (sequence & 0x0f) << 4
  report[2] = BLUETOOTH_OUTPUT_TAG
  return report
}

/**
 * Repair the Bluetooth envelope emitted by dualsense-ts 6.15.x.
 *
 * That release places the common payload at byte 2 behind a constant 0x02 byte.
 * Sony's report layout requires a sequence byte, a separate 0x10 tag, and the
 * common payload beginning at byte 3. The CRC must be recomputed after moving it.
 */
export function normalizeDualSenseBluetoothOutput(
  source: Uint8Array,
  sequence: number,
): Uint8Array {
  if (source.length !== BLUETOOTH_REPORT_LENGTH || source[0] !== BLUETOOTH_REPORT_ID) {
    return source
  }

  const report = header(sequence)
  report.set(
    source.subarray(SOURCE_COMMON_OFFSET, SOURCE_COMMON_OFFSET + COMMON_PAYLOAD_LENGTH),
    TARGET_COMMON_OFFSET,
  )
  return finalize(report)
}

/** Release the firmware-owned Bluetooth startup animation before setting RGB values. */
export function buildDualSenseBluetoothLedRelease(sequence: number): Uint8Array {
  const report = header(sequence)
  report[VALID_FLAG2_OFFSET] = LIGHTBAR_SETUP_ENABLE
  report[LIGHTBAR_SETUP_OFFSET] = LIGHTBAR_SETUP_LIGHT_OUT
  return finalize(report)
}

/**
 * Keep dualsense-ts for input parsing and its public output API, but repair its
 * Bluetooth transport framing before bytes reach node-hid.
 */
export class OpenMicroDualSenseHIDProvider extends NodeHIDProvider {
  private outputSequence = 0

  /**
   * Point dualsense-ts at the detected DualSense product id.
   *
   * dualsense-ts's NodeHIDProvider enumerates devices by a *static* product id
   * (0x0ce6, the standard DualSense). The Edge (0x0df2) therefore looks
   * present to node-hid but is invisible to connect(), which is why selecting
   * the DualSense driver for an Edge used to leave the app with no input and
   * no retry. The field is declared readonly in the typings but read from the
   * class object at connect() time, so assigning it here is the only way to
   * support the Edge without forking the library.
   *
   * Args:
   *     productId (number): Detected DualSense PID. Defaults to 0x0ce6.
   */
  constructor(productId: number = 0x0ce6) {
    super()
    ;(HIDProvider as unknown as { productId: number }).productId = productId
  }

  override async connect(): Promise<void> {
    this.outputSequence = 0
    await super.connect()
    if (this.connected && this.wireless) {
      await super.write(buildDualSenseBluetoothLedRelease(this.nextSequence()))
    }
  }

  override write(data: Uint8Array): Promise<void> {
    if (!this.wireless) return super.write(data)
    return super.write(normalizeDualSenseBluetoothOutput(data, this.nextSequence()))
  }

  private nextSequence(): number {
    const sequence = this.outputSequence
    this.outputSequence = (this.outputSequence + 1) & 0x0f
    return sequence
  }
}
