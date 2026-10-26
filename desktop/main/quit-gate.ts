/**
 * Small quit state machine for the Electron companion.
 *
 * The first Quit starts an asynchronous drain. Every later Quit must be
 * deferred until that drain finishes: macOS/Electron can otherwise exit while
 * a synthetic chord still owns a modifier key. This class makes the decision
 * testable instead of relying on variable ordering in the main process.
 */

export type QuitPhase = 'start' | 'waiting' | 'finished'

export class QuitGate {
  private started = false
  private finished = false

  /**
   * Classify the current quit attempt.
   *
   * Returns:
   *     QuitPhase: 'start' to begin draining, 'waiting' to defer, or
   *     'finished' to let the quit proceed.
   */
  begin(): QuitPhase {
    if (this.finished) return 'finished'
    if (this.started) return 'waiting'
    this.started = true
    return 'start'
  }

  /** Mark the drain complete; the next quit attempt is allowed through. */
  complete(): void {
    this.finished = true
  }
}
