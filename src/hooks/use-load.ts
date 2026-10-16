// Loads screen data from the database; reloads on demand and every time the screen gets focus again (a child screen
// may have changed it). Reads queue behind writes (withRead, D60), so a reload never shows a half-written state.
import { useFocusEffect } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';

import { useSQLiteContext } from '@/db/provider';
import { useCallback, useEffect, useState } from 'react';

export function useLoad<T>(load: (db: SQLiteDatabase) => Promise<T>, key: unknown = null) {
  const db = useSQLiteContext();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    load(db).then(
      (value) => {
        if (live) {
          setData(value);
          setError(null);
        }
      },
      (e: unknown) => {
        if (live) setError(e instanceof Error ? e : new Error(String(e)));
      }
    );
    return () => {
      live = false;
    };
    // `load` is a fresh closure every render; `key` + `tick` decide when to read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key, tick]);

  useFocusEffect(reload);
  return { data, error, reload };
}
