import { useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { ddd } from './ddd';
import type { IpcResult } from '../../shared/ipc-contract';

/** Despachetează IpcResult; aruncă eroarea pentru a fi tratată de apelant. */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Rulează un apel IPC read-only, cu stare de încărcare și reîncărcare automată la dataChanged. */
export function useIpcQuery<T>(
  fetcher: () => Promise<IpcResult<T>>,
  deps: unknown[],
): { data: T | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    unwrap(fetcherRef.current())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          notifications.show({ color: 'red', title: 'Eroare', message: err.message });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, tick]);

  useEffect(() => ddd.events.onDataChanged(reload), [reload]);

  return { data, loading, reload };
}

/** Execută o mutație IPC și afișează eroarea ca notificare. Întoarce true la succes. */
export async function runMutation<T>(
  promise: Promise<IpcResult<T>>,
  successMessage?: string,
): Promise<T | null> {
  try {
    const data = await unwrap(promise);
    if (successMessage) {
      notifications.show({ color: 'teal', message: successMessage });
    }
    return data;
  } catch (err) {
    notifications.show({
      color: 'red',
      title: 'Eroare',
      message: err instanceof Error ? err.message : 'A apărut o eroare.',
    });
    return null;
  }
}
