import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient, onBeforeTokenRefresh } from '../services/apiClient.js';

export type HierarchyEntityType = 'MODULE' | 'PAGE' | 'FEATURE' | 'SCENARIO';

export interface BatchSyncItem {
  entity_type: HierarchyEntityType;
  id: string;
  position: number;
}

/**
 * [3.3.3] Deferred Batch Drag-and-Drop Persistence Engine:
 * 1. Instant React state update.
 * 2. Idle timeout threshold: 5 minutes (300,000 ms).
 * 3. Route change / component unmount or window beforeunload event.
 * 4. Imminent Access Token renewal window.
 */
const IDLE_DEBOUNCE_MS = 5 * 60 * 1000; // 300,000 ms (5 minutes)

export interface DeferredOrderSyncHook {
  pendingCount: number;
  lastSyncedAt: string | null;
  queueBatchOrder: (items: BatchSyncItem[]) => void;
  flushPendingOrder: () => Promise<void>;
}

export function useDeferredOrderSync(): DeferredOrderSyncHook {
  const bufferRef = useRef<Map<string, BatchSyncItem>>(new Map());
  const timerRef = useRef<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const flushPendingOrder = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (bufferRef.current.size === 0) {
      return;
    }

    const items = Array.from(bufferRef.current.values());
    bufferRef.current.clear();
    setPendingCount(0);

    try {
      await apiClient.post('/projects/hierarchy/sync-order', { items });
      setLastSyncedAt(new Date().toISOString());
    } catch {
      // Re-queue if transient failure occurs
      for (const item of items) {
        bufferRef.current.set(`${item.entity_type}:${item.id}`, item);
      }
      setPendingCount(bufferRef.current.size);
    }
  }, []);

  const queueBatchOrder = useCallback(
    (items: BatchSyncItem[]): void => {
      for (const item of items) {
        bufferRef.current.set(`${item.entity_type}:${item.id}`, item);
      }
      setPendingCount(bufferRef.current.size);

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void flushPendingOrder();
      }, IDLE_DEBOUNCE_MS);
    },
    [flushPendingOrder],
  );

  // Trigger 2: Window beforeunload & component unmount (route change)
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (bufferRef.current.size > 0) {
        void flushPendingOrder();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (bufferRef.current.size > 0) {
        void flushPendingOrder();
      }
    };
  }, [flushPendingOrder]);

  // Trigger 3: Imminent Access Token renewal window
  useEffect(() => {
    const unsubscribe = onBeforeTokenRefresh(async () => {
      await flushPendingOrder();
    });
    return unsubscribe;
  }, [flushPendingOrder]);

  return {
    pendingCount,
    lastSyncedAt,
    queueBatchOrder,
    flushPendingOrder,
  };
}
