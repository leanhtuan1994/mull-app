export type SerialQueue = {
  /** Runs `task` after every task queued before it has settled. */
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Settles once everything queued so far has settled. */
  idle(): Promise<void>;
  readonly pending: number;
};

/** Model load, generate and unload go through one of these so they never overlap. */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;

  return {
    run<T>(task: () => Promise<T>) {
      pending += 1;
      const result = tail.then(task);
      tail = result
        .catch(() => undefined)
        .finally(() => {
          pending -= 1;
        });
      return result;
    },
    idle() {
      return tail.then(() => undefined);
    },
    get pending() {
      return pending;
    },
  };
}
