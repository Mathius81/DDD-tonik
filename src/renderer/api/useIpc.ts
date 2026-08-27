/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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

  // Detectăm schimbarea dependențelor CHIAR ÎN TIMPUL randării, nu abia în efectul de mai
  // jos (care rulează după primul paint). Fără asta, la o schimbare rapidă de filtru (ex.:
  // ziua din Programări) browserul apuca să picteze o fracțiune de secundă `data` VECHI ca și
  // cum ar fi valid pentru noile dependențe — fără niciun indicator de încărcare — abia apoi
  // sărea pe starea de încărcare/rezultat nou. De-asta se vedea o „sclipire” (tabelul zilei
  // vechi apărea și dispărea) la schimbarea zilei/filtrului. Ajustarea stării în timpul
  // randării e un tipar oficial React („You Might Not Need an Effect”): apelul lui setLoading
  // de mai jos face ca React să reia randarea sincron, ÎNAINTE de a picta ceva pe ecran, deci
  // browserul nu apucă niciodată să arate cadrul „vechi, nemarcat ca în curs de încărcare”.
  const prevDepsRef = useRef(deps);
  const depsChanged =
    prevDepsRef.current.length !== deps.length ||
    prevDepsRef.current.some((d, i) => !Object.is(d, deps[i]));
  if (depsChanged) {
    prevDepsRef.current = deps;
    if (!loading) setLoading(true);
  }

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
