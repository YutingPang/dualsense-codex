// Ordered shutdown for the CLI wrapper.
//
// Input producers (HID, key repeat, client SSE) must stop *before* the harness
// drains queued key chords. Otherwise a controller press/keystroke arriving
// during the async drain can be enqueued after cancellation and execute after
// the final release — or after the process exits. This helper makes the order
// explicit and gives tests one place to pin it.

export interface ShutdownSteps {
  /** Synchronously stop accepting new input. Must be idempotent. */
  stopInput(): void
  /** Drain/cancel the harness and release any synthetic keys. */
  dispose(): void | Promise<void>
  /** Release external resources after disposal, even if it rejected. */
  finish(): void
}

export class ShutdownCoordinator {
  private promise: Promise<void> | null = null

  constructor(private readonly steps: ShutdownSteps) {}

  /**
   * Run shutdown once: stop input, drain, then finish.
   *
   * Returns:
   *     Promise<void>: The same promise for repeated calls. Rejects if dispose
   *     rejects, after `finish()` has run.
   */
  run(): Promise<void> {
    if (this.promise) return this.promise
    this.steps.stopInput()
    this.promise = (async () => {
      try {
        await this.steps.dispose()
      } finally {
        this.steps.finish()
      }
    })()
    return this.promise
  }
}
