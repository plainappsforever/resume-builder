// The master profile (one row, id = 1) and its links. Every write goes through the write queue (tx.ts).
import type { LinkLabel, Profile, ProfileLink } from '@/engine/types';

import { NotFoundError } from './errors';
import { compactPositions, moveTo, nextPosition } from './positions';
import { withRead, withTransaction, withWrite } from './tx';
import type { Db } from './types';

type ProfileRow = {
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  city: string;
  region: string;
  country_code: string;
  birth_date: string | null;
  nationality: string | null;
  show_personal: number;
  photo_file: string | null;
  summary: string;
  is_example: number;
  updated_at: number;
};

export const EMPTY_PROFILE: Profile = {
  fullName: '',
  headline: '',
  email: '',
  phone: '',
  city: '',
  region: '',
  countryCode: '',
  birthDate: null,
  nationality: null,
  showPersonal: false,
  photoFile: null,
  summary: '',
  isExample: false,
  updatedAt: 0,
};

const COLUMNS: Record<Exclude<keyof Profile, 'updatedAt'>, keyof ProfileRow> = {
  fullName: 'full_name',
  headline: 'headline',
  email: 'email',
  phone: 'phone',
  city: 'city',
  region: 'region',
  countryCode: 'country_code',
  birthDate: 'birth_date',
  nationality: 'nationality',
  showPersonal: 'show_personal',
  photoFile: 'photo_file',
  summary: 'summary',
  isExample: 'is_example',
};

export type ProfilePatch = Partial<Omit<Profile, 'updatedAt'>>;

export function getProfile(db: Db): Promise<Profile> {
  return withRead(db, async (db) => {
    const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profile WHERE id = 1');
    if (!row) return { ...EMPTY_PROFILE };
    return {
      fullName: row.full_name,
      headline: row.headline,
      email: row.email,
      phone: row.phone,
      city: row.city,
      region: row.region,
      countryCode: row.country_code,
      birthDate: row.birth_date,
      nationality: row.nationality,
      showPersonal: row.show_personal === 1,
      photoFile: row.photo_file,
      summary: row.summary,
      isExample: row.is_example === 1,
      updatedAt: row.updated_at,
    };
  });
}

/** Creates the row on first use; only the given fields change. */
export async function updateProfile(db: Db, patch: ProfilePatch, now = Date.now()): Promise<void> {
  const keys = (Object.keys(patch) as (keyof ProfilePatch)[]).filter((k) => k in COLUMNS && patch[k] !== undefined);
  await withTransaction(db, async (tx) => {
    await tx.runAsync('INSERT INTO profile (id, updated_at) VALUES (1, ?) ON CONFLICT(id) DO NOTHING', now);
    const sets = keys.map((k) => `${COLUMNS[k]} = ?`);
    const values = keys.map((k) => {
      const v = patch[k];
      return typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | null);
    });
    await tx.runAsync(`UPDATE profile SET ${[...sets, 'updated_at = ?'].join(', ')} WHERE id = 1`, ...values, now);
  });
}

type LinkRow = { id: number; position: number; label: LinkLabel; custom_label: string | null; url: string };
const LINKS = { table: 'profile_links' } as const;

export function listLinks(db: Db): Promise<ProfileLink[]> {
  return withRead(db, async (db) => {
    const rows = await db.getAllAsync<LinkRow>('SELECT * FROM profile_links ORDER BY position, id');
    return rows.map((r) => ({ id: r.id, position: r.position, label: r.label, customLabel: r.custom_label, url: r.url }));
  });
}

export type LinkInput = { label: LinkLabel; customLabel?: string | null; url: string };

export function addLink(db: Db, input: LinkInput): Promise<number> {
  return withWrite(db, async (tx) => {
    const result = await tx.runAsync(
      'INSERT INTO profile_links (position, label, custom_label, url) VALUES (?, ?, ?, ?)',
      await nextPosition(tx, LINKS),
      input.label,
      input.customLabel ?? null,
      input.url.trim()
    );
    return result.lastInsertRowId;
  });
}

export async function updateLink(db: Db, id: number, input: LinkInput): Promise<void> {
  await withWrite(db, async (tx) => {
    const r = await tx.runAsync(
      'UPDATE profile_links SET label = ?, custom_label = ?, url = ? WHERE id = ?',
      input.label,
      input.customLabel ?? null,
      input.url.trim(),
      id
    );
    if (r.changes === 0) throw new NotFoundError('link', id);
  });
}

export async function moveLink(db: Db, id: number, toIndex: number): Promise<void> {
  await withTransaction(db, (tx) => moveTo(tx, LINKS, id, toIndex));
}

export async function deleteLink(db: Db, id: number): Promise<void> {
  await withTransaction(db, async (tx) => {
    await tx.runAsync('DELETE FROM profile_links WHERE id = ?', id);
    await compactPositions(tx, LINKS);
  });
}
