export type QueuePriority = 'normal' | 'background';

export type SerialQueue = {
  /**
   * Runs `task` once everything ahead of it has settled. Background tasks
   * wait behind every normal task, even ones queued after them, so a long
   * series of background work never delays an answer by more than the one
   * background task already running.
   */
  run<T>(task: () => Promise<T>, priority?: QueuePriority): Promise<T>;
  /** Settles once everything queued so far has settled. */
  idle(): Promise<void>;
  readonly pending: number;
  /** Normal tasks queued or running; background work checks this to yield. */
  readonly pendingNormal: number;
};

type Job = {
  task: () => Promise<unknown>;
  priority: QueuePriority;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

/** Model load, generate, embed and unload go through one of these so they never overlap. */
export function createSerialQueue(): SerialQueue {
  const jobs: Job[] = [];
  let running: Job | null = null;
  let idleWaiters: (() => void)[] = [];

  function drain() {
    if (running) return;
    const job = jobs.shift();
    if (!job) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
      return;
    }
    running = job;
    job
      .task()
      .then(job.resolve, job.reject)
      .finally(() => {
        running = null;
        drain();
      });
  }

  return {
    run<T>(task: () => Promise<T>, priority: QueuePriority = 'normal') {
      return new Promise<T>((resolve, reject) => {
        const job: Job = {
          task,
          priority,
          resolve: resolve as (value: unknown) => void,
          reject,
        };
        const firstBackground = jobs.findIndex(
          (j) => j.priority === 'background'
        );
        if (priority === 'normal' && firstBackground !== -1) {
          jobs.splice(firstBackground, 0, job);
        } else {
          jobs.push(job);
        }
        // Start on the next microtask so callers queued in the same tick
        // keep their order, as with a promise chain.
        void Promise.resolve().then(drain);
      });
    },
    idle() {
      if (!running && jobs.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    get pending() {
      return jobs.length + (running ? 1 : 0);
    },
    get pendingNormal() {
      const queued = jobs.filter((j) => j.priority === 'normal').length;
      return queued + (running?.priority === 'normal' ? 1 : 0);
    },
  };
}
