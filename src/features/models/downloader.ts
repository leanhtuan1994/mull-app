import {
  completeHandler,
  createDownloadTask,
  type DownloadTask,
  getExistingDownloadTasks,
  setConfig,
} from '@kesha-antonov/react-native-background-downloader';

export type TransferHandlers = {
  onProgress: (bytesDone: number, bytesTotal: number) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

export type LiveTransfer = {
  id: string;
  bytesDone: number;
  bytesTotal: number;
};

/** The background transfer layer the model store drives; tests swap in a fake. */
export type DownloadTransport = {
  start(
    request: { id: string; url: string; destination: string },
    handlers: TransferHandlers
  ): void;
  stop(id: string): Promise<void>;
  /** Reconnects to transfers that kept running while Mull was closed. */
  reattach(
    handlersFor: (id: string) => TransferHandlers
  ): Promise<LiveTransfer[]>;
  /** Tells iOS the app finished handling a background session event. */
  complete(id: string): void;
};

function bind(task: DownloadTask, handlers: TransferHandlers) {
  task
    .progress(({ bytesDownloaded, bytesTotal }) =>
      handlers.onProgress(bytesDownloaded, bytesTotal)
    )
    .done(() => handlers.onDone())
    .error(({ error }) => handlers.onError(error));
}

/** Background URLSession transfers through react-native-background-downloader. */
export function createBackgroundTransport(): DownloadTransport {
  const tasks = new Map<string, DownloadTask>();
  // Only options that do not rebuild the URLSession: changing
  // allowsCellularAccess invalidates it and cancels running transfers, so the
  // cellular policy is enforced before a download starts instead.
  setConfig({ progressInterval: 500 });

  return {
    start(request, handlers) {
      const { id } = request;
      const task = createDownloadTask(request);
      bind(task, handlers);
      tasks.set(id, task);
      task.start();
    },
    async stop(id) {
      const task = tasks.get(id);
      tasks.delete(id);
      await task?.stop();
    },
    async reattach(handlersFor) {
      const existing = await getExistingDownloadTasks();
      const live: LiveTransfer[] = [];
      for (const task of existing) {
        if (task.state === 'FAILED' || task.state === 'STOPPED') continue;
        tasks.set(task.id, task);
        bind(task, handlersFor(task.id));
        if (task.state === 'PAUSED') await task.resume();
        live.push({
          id: task.id,
          bytesDone: task.bytesDownloaded,
          bytesTotal: task.bytesTotal,
        });
      }
      return live;
    },
    complete(id) {
      tasks.delete(id);
      completeHandler(id);
    },
  };
}
