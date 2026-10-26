// Serial task queue with cancellation, used for synthetic macOS key chords.
//
// Chords must not interleave (two osascripts can strand a modifier), and a
// queued chord must not run after the user paused, changed config, or quit:
// its key-down steps would land after the "release everything" sweep.
//
// cancel(cleanup) is an atomic barrier: tasks queued before it are dropped, the
// in-flight task is awaited, cleanup (key release) runs, and only then do tasks
// queued *during* the drain start. A plain generation check is not enough —
// without the gate a new key-down can slip in between the drain and the release
// (or the release can interrupt a newly started hold-to-talk chord).

export class ChordQueue {
  private tail: Promise<void> = Promise.resolve()
  private generation = 0
  private gate: Promise<void> = Promise.resolve()
  private openGate: (() => void) | null = null
  private draining: Promise<void> | null = null

  /**
   * Queue a task. Tasks queued before a cancel() are silently skipped; tasks
   * queued during cleanup wait for the cleanup barrier to open.
   *
   * Args:
   *     task (function): Async work that performs one chord and resolves when done.
   *
   * Returns:
   *     None. Task failures are contained so they cannot wedge later work.
   */
  run(task: () => Promise<void>): void {
    const generation = this.generation
    const gate = this.gate
    this.tail = this.tail
      .then(async () => {
        await gate
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
   * Cancel queued tasks, drain the in-flight one, run cleanup, then reopen the
   * queue. New work submitted while waiting starts only after cleanup.
   *
   * Args:
   *     cleanup (function): Key-release/cleanup work run at the barrier.
   *
   * Returns:
   *     Promise<void>: Resolves when cleanup has completed and new work may run.
   */
  async cancel(cleanup: () => void | Promise<void> = () => {}): Promise<void> {
    if (this.draining) return this.draining
    this.generation += 1
    const gate = new Promise<void>((resolve) => {
      this.openGate = () => resolve()
    })
    this.gate = gate
    const previous = this.tail
    this.draining = (async () => {
      await previous.catch(() => {
        // The in-flight task's failure was already reported by its caller.
      })
      try {
        await cleanup()
      } finally {
        // Always reopen, including when cleanup throws, so a failed release
        // cannot wedge pause/resume forever.
        this.openGate?.()
        this.openGate = null
        this.gate = Promise.resolve()
      }
    })().finally(() => {
      this.draining = null
    })
    return this.draining
  }
}
