// Every edit of the master from a screen goes through here: after it the data is the user's (D64), so an example
// profile can no longer be removed as "example".
import type { SQLiteDatabase } from 'expo-sqlite';

import { useSQLiteContext } from '@/db/provider';
import { useCallback } from 'react';

import { adoptExample } from '@/db/example';

export function useMasterEdit() {
  const db = useSQLiteContext();
  return useCallback(
    async <T,>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> => {
      const result = await fn(db);
      await adoptExample(db);
      return result;
    },
    [db]
  );
}
