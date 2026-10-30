export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled';

export type DownloadErrorKind =
  | 'network'
  | 'checksum'
  | 'size'
  | 'disk'
  | 'unknown';

export type DownloadState = {
  status: DownloadStatus;
  bytesDone: number;
  bytesTotal: number;
  error?: DownloadErrorKind;
};

export type DownloadEvent =
  | { type: 'enqueue'; bytesTotal: number }
  | { type: 'start' }
  | { type: 'progress'; bytesDone: number; bytesTotal?: number }
  | { type: 'downloaded' }
  | { type: 'verified' }
  | { type: 'fail'; error: DownloadErrorKind }
  | { type: 'cancel' };

/** Which events each status accepts. Anything else is ignored. */
const ACCEPTS: Record<DownloadStatus | 'none', DownloadEvent['type'][]> = {
  none: ['enqueue'],
  queued: ['start', 'cancel', 'fail'],
  downloading: ['progress', 'downloaded', 'fail', 'cancel'],
  verifying: ['verified', 'fail'],
  done: ['enqueue'],
  failed: ['enqueue', 'cancel'],
  cancelled: ['enqueue'],
};

/**
 * idle → queued → downloading → verifying → done | failed | cancelled.
 * A file only becomes "done" after the verifying step checked it.
 */
export function reduceDownload(
  state: DownloadState | undefined,
  event: DownloadEvent
): DownloadState | undefined {
  if (!ACCEPTS[state?.status ?? 'none'].includes(event.type)) return state;
  switch (event.type) {
    case 'enqueue':
      return { status: 'queued', bytesDone: 0, bytesTotal: event.bytesTotal };
    case 'start':
      return { ...state!, status: 'downloading', bytesDone: 0 };
    case 'progress':
      return {
        ...state!,
        bytesDone: event.bytesDone,
        bytesTotal:
          event.bytesTotal && event.bytesTotal > 0
            ? event.bytesTotal
            : state!.bytesTotal,
      };
    case 'downloaded':
      return { ...state!, status: 'verifying', bytesDone: state!.bytesTotal };
    case 'verified':
      return { ...state!, status: 'done' };
    case 'fail':
      return { ...state!, status: 'failed', error: event.error };
    case 'cancel':
      return { ...state!, status: 'cancelled', bytesDone: 0 };
  }
}

export function downloadFraction(state: DownloadState | undefined): number {
  if (!state || state.bytesTotal <= 0) return 0;
  if (state.status === 'verifying' || state.status === 'done') return 1;
  return Math.min(1, Math.max(0, state.bytesDone / state.bytesTotal));
}

/** Queued, downloading or verifying: shown in the "N đang tải" pill. */
export function isActiveDownload(state: DownloadState | undefined): boolean {
  return (
    state?.status === 'queued' ||
    state?.status === 'downloading' ||
    state?.status === 'verifying'
  );
}

export const MAX_PARALLEL_DOWNLOADS = 2;

/** Queued ids that may start now, oldest first, keeping at most two transfers running. */
export function downloadsToStart(
  downloads: Record<string, DownloadState | undefined>,
  order: string[]
): string[] {
  const running = Object.values(downloads).filter(
    (d) => d?.status === 'downloading'
  ).length;
  const slots = Math.max(0, MAX_PARALLEL_DOWNLOADS - running);
  return order
    .filter((id) => downloads[id]?.status === 'queued')
    .slice(0, slots);
}
