// Controller output surface. Only DualSense implements this — other drivers
// leave `output` undefined, callers use `driver.output?.setLightbar(...)`.

export interface ControllerOutput {
  setLightbar(color: { r: number; g: number; b: number }): void
  setPlayerLeds(bitmask: number): void
  /** Set both rumble motors to an intensity from 0 (off) to 1 (maximum). */
  setRumble(intensity: number): void
}
