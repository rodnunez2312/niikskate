export interface OfflineReplayFailure {
  url: string
  method: string
  status: number
  detail: string
}

/** Connection + offline write-queue status, fed by plugins/pwa.client.ts. */
export function useOfflineState() {
  return {
    online: useState('niik-online', () => true),
    pending: useState('niik-offline-pending', () => 0),
    failed: useState<OfflineReplayFailure[]>('niik-offline-failed', () => []),
  }
}
