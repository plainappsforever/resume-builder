// Cover letters (F12). Optional link to a version (its style is used for the PDF); deleting the version unlinks it.
import type { Lang } from '@/engine/types';

import { isSafeExportPath } from '@/data/history';

import { NotFoundError } from './errors';
import { withRead, withWrite } from './tx';
import type { Db } from './types';

export type CoverLetter = {
  id: number;
  versionId: number | null;
  language: Lang;
  recipientCompany: string;
  contactPerson: string;
  address: string;
  /** ISO `YYYY-MM-DD`; NULL = the export date. */
  letterDate: string | null;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signatureName: string;
  isExample: boolean;
  createdAt: number;
  updatedAt: number;
};

type CoverRow = {
  id: number;
  version_id: number | null;
  language: Lang;
  recipient_company: string;
  contact_person: string;
  address: string;
  letter_date: string | null;
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signature_name: string;
  is_example: number;
  created_at: number;
  updated_at: number;
};

function toCover(r: CoverRow): CoverLetter {
  return {
    id: r.id,
    versionId: r.version_id,
    language: r.language,
    recipientCompany: r.recipient_company,
    contactPerson: r.contact_person,
    address: r.address,
    letterDate: r.letter_date,
    subject: r.subject,
    salutation: r.salutation,
    body: r.body,
    closing: r.closing,
    signatureName: r.signature_name,
    isExample: r.is_example === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type CoverPatch = Partial<Omit<CoverLetter, 'id' | 'createdAt' | 'updatedAt'>>;

const COLUMNS: Record<keyof CoverPatch, string> = {
  versionId: 'version_id',
  language: 'language',
  recipientCompany: 'recipient_company',
  contactPerson: 'contact_person',
  address: 'address',
  letterDate: 'letter_date',
  subject: 'subject',
  salutation: 'salutation',
  body: 'body',
  closing: 'closing',
  signatureName: 'signature_name',
  isExample: 'is_example',
};

function columnsOf(patch: CoverPatch) {
  const keys = (Object.keys(patch) as (keyof CoverPatch)[]).filter((k) => k in COLUMNS && patch[k] !== undefined);
  return {
    names: keys.map((k) => COLUMNS[k]),
    values: keys.map((k) => {
      const v = patch[k];
      return typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null);
    }),
  };
}

export function getCover(db: Db, id: number): Promise<CoverLetter | null> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<CoverRow>('SELECT * FROM cover_letters WHERE id = ?', id);
    return row ? toCover(row) : null;
  });
}

export function listCovers(db: Db): Promise<CoverLetter[]> {
  return withRead(db, async (db) => {
    return (await db.getAllAsync<CoverRow>('SELECT * FROM cover_letters ORDER BY updated_at DESC, id DESC')).map(toCover);
  });
}

export function createCover(db: Db, input: CoverPatch = {}, now = Date.now()): Promise<number> {
  const { names, values } = columnsOf(input);
  return withWrite(db, async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO cover_letters (${[...names, 'created_at', 'updated_at'].join(', ')})
       VALUES (${[...names, 'c', 'u'].map(() => '?').join(', ')})`,
      ...values,
      now,
      now
    );
    return result.lastInsertRowId;
  });
}

export async function updateCover(db: Db, id: number, patch: CoverPatch, now = Date.now()): Promise<void> {
  const { names, values } = columnsOf(patch);
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync(
      `UPDATE cover_letters SET ${[...names.map((n) => `${n} = ?`), 'updated_at = ?'].join(', ')} WHERE id = ?`,
      ...values,
      now,
      id
    );
    if (r.changes === 0) throw new NotFoundError('cover letter', id);
  });
}

/** Deletes the letter and its export rows (cascade); returns their file paths for the app to remove (P5 glue). */
export function deleteCover(db: Db, id: number): Promise<string[]> {
  return withWrite(db, async (tx) => {
    const files = await tx.getAllAsync<{ file_path: string }>(
      'SELECT file_path FROM exports WHERE cover_letter_id = ? AND file_path IS NOT NULL',
      id
    );
    await tx.runAsync('DELETE FROM cover_letters WHERE id = ?', id);
    return files.map((f) => f.file_path).filter((p) => isSafeExportPath(p)); // D59
  });
}
