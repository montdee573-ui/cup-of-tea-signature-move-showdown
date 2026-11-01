// Bound both provider fan-out and the time an owner queue waits. A timed-out
// wait does not cancel a check or release its slot: it may still save a result.
export class RefundQueueChecks {
  private readonly active = new Map<string, Promise<void>>();

  constructor(private readonly concurrency = 3, private readonly waitMs = 200) {}

  async run(candidates: Array<{ id: string; check: () => Promise<void> }>): Promise<void> {
    const waiting: Promise<void>[] = [];
    for (const candidate of candidates) {
      let pending = this.active.get(candidate.id);
      if (!pending && this.active.size < this.concurrency) {
        pending = Promise.resolve().then(candidate.check).finally(() => {
          this.active.delete(candidate.id);
        });
        this.active.set(candidate.id, pending);
      }
      if (pending) waiting.push(pending);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(waiting),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, this.waitMs); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
