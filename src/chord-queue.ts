// Serial task queue with cancellation, used for synthetic macOS key chords.
//
// Chords must not interleave (two osascripts can strand a modifier), and a
// queued chord must not run after the user paused, changed config, or quit:
// its key-down steps would land after the "release everything" sweep. cancel()
// drops everything still queued and resolves once the in-flight task (bounded
// by the caller's exec timeout) has settled, so the caller can release keys
// last and know nothing will press them again.

export class ChordQueue {
  private tail: Promise<void> = Promise.resolve()
  private generation = 0

  /**
   * Queue a task. Tasks queued before a cancel() are silently skipped.
   *
   * Args:
   *     task (function): Async work that performs one chord and resolves when done.
   *
   * Returns:
   *     None. Task failures are contained so they cannot wedge later work.
   */
  run(task: () => Promise<void>): void {
    const generation = this.generation
    this.tail = this.tail
      .then(async () => {
        if (generation !== this.generation) return
        await task()
      })
      .catch(() => {
        // A rejected task must not poison the queue; its caller reports it.
      })
  }

  /**
   * Wait for everything currently queued to finish (no cancellation).
   *
   * Returns:
   *     Promise<void>: Resolves when the queue is idle again.
   */
  async settle(): Promise<void> {
    await this.tail
  }

  /**
   * Cancel queued tasks and wait for the in-flight one to finish.
   *
   * Args:
   *     None.
   *
   * Returns:
   *     Promise<void>: Resolves when the queue is idle again. New work queued
   *     after this call is accepted and runs normally (pause/resume-safe).
   */
  async cancel(): Promise<void> {
    this.generation += 1
    await this.settle()
  }
}
