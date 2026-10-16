// Backup file format (SPEC §9, D22): readable JSON of every table + the photo; export-history PDFs are not included
// (their snapshots are). PURE: build, parse + validate FULLY before anything changes, and the restore plan. The
// database side (read all tables, replace everything in ONE transaction) is src/db/backup.ts.
import { validateDateRange } from '@/engine/dates';
import { SECTION_KINDS, LINK_LABELS, TEMPLATE_IDS } from '@/engine/types';

import { isSafeExportPath } from './history';

export const BACKUP_FORMAT = 'resume-builder-backup';
export const BACKUP_VERSION = 1;
/** The database schema this format describes (= LATEST_VERSION of src/db/migrations.ts; a Jest test pins it). */
export const BACKUP_SCHEMA = 2;
export const MAX_PHOTO_BASE64 = 4_000_000; // ≈ 3 MB image; the app stores JPEG ≤ 600 px (D27)

type ColType = 'int' | 'int?' | 'text' | 'text?' | 'bool';
type Check = (row: Row, ctx: { currentYear: number }) => boolean;
type TableSpec = { columns: Record<string, ColType>; key: string[]; checks?: [string, Check][] };
export type Row = Record<string, string | number | null>;

const oneOf = (col: string, values: readonly string[]): [string, Check] => [`${col} in list`, (r) => values.includes(r[col] as string)];
const DATE = /^[12]\d{3}(-(0[1-9]|1[0-2]))?$/;
const dateCol = (col: string): [string, Check] => [`${col} date format`, (r) => r[col] === null || DATE.test(r[col] as string)];

/** Every table of migration 2 in insert order (parents first). Columns exactly as in the schema. */
export const BACKUP_TABLES: Record<string, TableSpec> = {
  profile: {
    columns: {
      id: 'int', full_name: 'text', headline: 'text', email: 'text', phone: 'text', city: 'text', region: 'text',
      country_code: 'text', birth_date: 'text?', nationality: 'text?', show_personal: 'bool', photo_file: 'text?',
      summary: 'text', is_example: 'bool', updated_at: 'int',
    },
    key: ['id'],
    checks: [['id = 1', (r) => r.id === 1]],
  },
  profile_links: {
    columns: { id: 'int', position: 'int', label: 'text', custom_label: 'text?', url: 'text' },
    key: ['id'],
    checks: [oneOf('label', LINK_LABELS)],
  },
  sections: {
    columns: { id: 'int', kind: 'text', custom_title: 'text?', position: 'int' },
    key: ['id'],
    checks: [oneOf('kind', SECTION_KINDS)],
  },
  entries: {
    columns: {
      id: 'int', section_id: 'int', position: 'int', title: 'text', organization: 'text', location: 'text',
      start_date: 'text?', end_date: 'text?', is_current: 'bool', url: 'text', description: 'text', extra_json: 'text',
      created_at: 'int', updated_at: 'int',
    },
    key: ['id'],
    checks: [
      dateCol('start_date'),
      dateCol('end_date'),
      ['current has no end date', (r) => r.is_current === 0 || r.end_date === null],
      // D59: the same rules as the entry editor (years 1950 … this year + 6, end not before start); `currentYear` is
      // bound by parseBackup.
      ['dates valid', (r, ctx) => datesValid(r, ctx.currentYear)],
      ['extra_json is an object of strings', (r) => isStringRecordJson(r.extra_json as string)],
    ],
  },
  bullets: {
    columns: { id: 'int', entry_id: 'int', position: 'int', text: 'text', created_at: 'int', updated_at: 'int' },
    key: ['id'],
  },
  versions: {
    columns: {
      id: 'int', name: 'text', target_company: 'text', target_role: 'text', job_ad: 'text', language: 'text',
      template: 'text', style_json: 'text', headline_override: 'text?', summary_override: 'text?',
      source_version_id: 'int?', archived: 'bool', is_example: 'bool', created_at: 'int', updated_at: 'int',
      last_exported_at: 'int?',
    },
    key: ['id'],
    checks: [oneOf('language', ['en', 'de']), oneOf('template', TEMPLATE_IDS), ['style_json is an object', (r) => isObjectJson(r.style_json as string)]],
  },
  version_sections: {
    columns: { version_id: 'int', section_id: 'int', included: 'bool', position: 'int?', title_override: 'text?', page_break_before: 'bool' },
    key: ['version_id', 'section_id'],
  },
  version_entries: {
    columns: { version_id: 'int', entry_id: 'int', included: 'bool', position: 'int?', override_json: 'text', seen_master_at: 'int?' },
    key: ['version_id', 'entry_id'],
    checks: [['override_json is an object of strings', (r) => isStringRecordJson(r.override_json as string)]],
  },
  version_bullets: {
    columns: { version_id: 'int', bullet_id: 'int', included: 'bool', position: 'int?', text_override: 'text?' },
    key: ['version_id', 'bullet_id'],
  },
  version_keywords: {
    columns: { version_id: 'int', term: 'text', source: 'text', state: 'text' },
    key: ['version_id', 'term'],
    checks: [oneOf('source', ['auto', 'added']), oneOf('state', ['normal', 'pinned', 'ignored'])],
  },
  cover_letters: {
    columns: {
      id: 'int', version_id: 'int?', language: 'text', recipient_company: 'text', contact_person: 'text', address: 'text',
      letter_date: 'text?', subject: 'text', salutation: 'text', body: 'text', closing: 'text', signature_name: 'text',
      is_example: 'bool', created_at: 'int', updated_at: 'int',
    },
    key: ['id'],
    checks: [oneOf('language', ['en', 'de'])],
  },
  exports: {
    columns: {
      id: 'int', version_id: 'int?', cover_letter_id: 'int?', kind: 'text', file_path: 'text?', file_name: 'text',
      page_count: 'int?', bytes: 'int?', snapshot_json: 'text', readback_json: 'text?', created_at: 'int',
    },
    key: ['id'],
    checks: [
      oneOf('kind', ['resume_pdf', 'cover_pdf', 'plain_text']),
      ['exactly one owner', (r) => (r.version_id === null) !== (r.cover_letter_id === null)],
      ['snapshot is JSON', (r) => isObjectJson(r.snapshot_json as string)],
      ['read-back is JSON', (r) => r.readback_json === null || isObjectJson(r.readback_json as string)],
      // D59: the path is later opened and DELETED by the app: only its own export folder, owner's own sub-folder.
      [
        'file path inside the export folder',
        (r) => r.file_path === null || isSafeExportPath(r.file_path as string, { versionId: r.version_id as number | null, coverLetterId: r.cover_letter_id as number | null }),
      ],
    ],
  },
  settings: { columns: { key: 'text', value: 'text' }, key: ['key'] },
};

export const TABLE_ORDER = Object.keys(BACKUP_TABLES);
export type BackupData = Record<string, Row[]>;
export type BackupPhoto = { mime: 'image/jpeg' | 'image/png'; base64: string };
export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: { name: string; version: string; schema: number };
  data: BackupData;
  photo: BackupPhoto | null;
};

/** Foreign keys (child table.column → parent table), checked before a restore touches anything. */
const REFERENCES: [string, string, string, boolean][] = [
  ['entries', 'section_id', 'sections', false],
  ['bullets', 'entry_id', 'entries', false],
  ['versions', 'source_version_id', 'versions', true],
  ['version_sections', 'version_id', 'versions', false],
  ['version_sections', 'section_id', 'sections', false],
  ['version_entries', 'version_id', 'versions', false],
  ['version_entries', 'entry_id', 'entries', false],
  ['version_bullets', 'version_id', 'versions', false],
  ['version_bullets', 'bullet_id', 'bullets', false],
  ['version_keywords', 'version_id', 'versions', false],
  ['cover_letters', 'version_id', 'versions', true],
  ['exports', 'version_id', 'versions', true],
  ['exports', 'cover_letter_id', 'cover_letters', true],
];

function datesValid(r: Row, currentYear: number): boolean {
  const errors = validateDateRange(
    { startDate: r.start_date as string | null, endDate: r.end_date as string | null, isCurrent: r.is_current === 1 },
    currentYear
  );
  return !errors.start && !errors.end;
}

function isObjectJson(text: string): boolean {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  } catch {
    return false;
  }
}

function isStringRecordJson(text: string): boolean {
  if (!isObjectJson(text)) return false;
  return Object.values(JSON.parse(text) as Record<string, unknown>).every((v) => typeof v === 'string');
}

export function buildBackup(data: BackupData, photo: BackupPhoto | null, app: Backup['app'], now: Date): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), app, data, photo };
}

/** Readable: two-space indentation. */
export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2) + '\n';
}

/** File name of a backup: `Resume-Builder-Backup-2026-10-01.json`. */
export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Resume-Builder-Backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type BackupError =
  | { code: 'notJson' }
  | { code: 'foreign' }
  | { code: 'newer'; version: number }
  /** Made by an app with a newer database schema (D59). */
  | { code: 'newerSchema'; schema: number }
  | { code: 'invalid'; detail: string };

export type BackupSummary = {
  exportedAt: string;
  fullName: string;
  sections: number;
  entries: number;
  bullets: number;
  versions: number;
  coverLetters: number;
  exports: number;
  photo: boolean;
};

export type ParseResult = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: BackupError };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function typeOk(value: unknown, type: ColType): boolean {
  switch (type) {
    case 'int':
      return Number.isSafeInteger(value);
    case 'int?':
      return value === null || Number.isSafeInteger(value);
    case 'text':
      return typeof value === 'string';
    case 'text?':
      return value === null || typeof value === 'string';
    case 'bool':
      return value === 0 || value === 1;
  }
}

/**
 * Full validation (format, version, schema, every row, every reference, the photo). Nothing is changed by parsing.
 * NUL characters in text are removed (D59). `today` = the restoring device's date (year limit of entry dates).
 */
export function parseBackup(text: string, today: Date = new Date()): ParseResult {
  const ctx = { currentYear: today.getFullYear() };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'notJson' } };
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) return { ok: false, error: { code: 'foreign' } };
  const invalid = (detail: string): ParseResult => ({ ok: false, error: { code: 'invalid', detail } });
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 1) return invalid('version');
  if ((raw.version as number) > BACKUP_VERSION) return { ok: false, error: { code: 'newer', version: raw.version as number } };
  if (typeof raw.exportedAt !== 'string' || !isObj(raw.app) || !isObj(raw.data)) return invalid('header');
  const app = raw.app;
  if (typeof app.name !== 'string' || typeof app.version !== 'string' || !Number.isSafeInteger(app.schema) || (app.schema as number) < 1) return invalid('app');
  if ((app.schema as number) > BACKUP_SCHEMA) return { ok: false, error: { code: 'newerSchema', schema: app.schema as number } };

  const data: BackupData = {};
  const extraTables = Object.keys(raw.data).filter((t) => !(t in BACKUP_TABLES));
  if (extraTables.length) return invalid(`unknown table ${extraTables[0]}`);
  for (const table of TABLE_ORDER) {
    const rows = raw.data[table];
    if (!Array.isArray(rows)) return invalid(`${table}: missing`);
    const spec = BACKUP_TABLES[table];
    const cols = Object.keys(spec.columns);
    const keys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row: unknown = rows[i];
      const where = `${table}[${i}]`;
      if (!isObj(row)) return invalid(where);
      const rowCols = Object.keys(row);
      if (rowCols.length !== cols.length || !cols.every((c) => c in row)) return invalid(`${where}: columns`);
      for (const c of cols) if (!typeOk(row[c], spec.columns[c])) return invalid(`${where}.${c}`);
      for (const c of cols) if (typeof row[c] === 'string' && (row[c] as string).includes('\u0000')) row[c] = (row[c] as string).replace(/\u0000/g, '');
      for (const [name, check] of spec.checks ?? []) if (!check(row as Row, ctx)) return invalid(`${where}: ${name}`);
      const key = spec.key.map((k) => String(row[k])).join('\u0000');
      if (keys.has(key)) return invalid(`${where}: duplicate key`);
      keys.add(key);
    }
    data[table] = rows as Row[];
  }
  if (data.profile.length > 1) return invalid('profile: more than one row');
  for (const [child, col, parent, nullable] of REFERENCES) {
    const ids = new Set(data[parent].map((r) => r.id));
    for (const r of data[child]) {
      if (r[col] === null && nullable) continue;
      if (!ids.has(r[col])) return invalid(`${child}.${col} → ${parent} ${String(r[col])}`);
    }
  }

  let photo: BackupPhoto | null = null;
  if (raw.photo !== null && raw.photo !== undefined) {
    const p = raw.photo;
    if (!isObj(p) || (p.mime !== 'image/jpeg' && p.mime !== 'image/png') || typeof p.base64 !== 'string') return invalid('photo');
    if (p.base64.length > MAX_PHOTO_BASE64 || p.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(p.base64)) return invalid('photo data');
    photo = { mime: p.mime, base64: p.base64 };
  }

  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: raw.version as number,
    exportedAt: raw.exportedAt,
    app: { name: app.name, version: app.version, schema: app.schema as number },
    data,
    photo,
  };
  return {
    ok: true,
    backup,
    summary: {
      exportedAt: backup.exportedAt,
      fullName: (data.profile[0]?.full_name as string | undefined) ?? '',
      sections: data.sections.length,
      entries: data.entries.length,
      bullets: data.bullets.length,
      versions: data.versions.length,
      coverLetters: data.cover_letters.length,
      exports: data.exports.length,
      photo: photo !== null,
    },
  };
}

/**
 * The photo files of a restore (D62; review finding 9). The backup's photo goes to a NEW file (never over the current
 * one); the database transaction then points the profile at it. Only after COMMIT is the old photo deleted; if the
 * restore fails (or the app is killed before COMMIT), the new file is the one to delete, and the old photo and the old
 * database are both intact ("nothing changed", SPEC §10). Paths are relative to the document directory.
 */
export type PhotoRestore = { write: { path: string; photo: BackupPhoto } | null; deleteAfterCommit: string | null; deleteOnFailure: string | null };

export function photoRestorePlan(backup: Backup, currentPhotoFile: string | null, now: number): PhotoRestore {
  const write = backup.photo ? { path: `photos/restored-${now}.${backup.photo.mime === 'image/png' ? 'png' : 'jpg'}`, photo: backup.photo } : null;
  return {
    write,
    deleteAfterCommit: currentPhotoFile !== null && currentPhotoFile !== write?.path ? currentPhotoFile : null,
    deleteOnFailure: write?.path ?? null,
  };
}

/**
 * What a restore writes: every table's rows in insert order. `photoFile` = the NEW file the glue wrote the backup's
 * photo to (photoRestorePlan), or nothing when the backup has no photo.
 */
export function restorePlan(backup: Backup, photoFile: string | null): { table: string; rows: Row[] }[] {
  const oldPhoto = (backup.data.profile[0]?.photo_file as string | null | undefined) ?? null;
  const newPhoto = backup.photo ? photoFile : null;
  return TABLE_ORDER.map((table) => ({
    table,
    rows:
      table === 'profile'
        ? backup.data.profile.map((r) => ({ ...r, photo_file: newPhoto }))
        : table === 'exports'
          ? backup.data.exports.map((r) => ({ ...r, snapshot_json: repointSnapshotPhoto(r.snapshot_json as string, oldPhoto, newPhoto) }))
          : backup.data[table],
  }));
}

/**
 * v1.1 (D96, REVIEW_V1 #9): a history snapshot that printed the profile photo names its OLD file; the restore writes the photo
 * to a new file, so the snapshot is pointed at it (or at no photo when the backup has none). Other snapshots stay as they are.
 */
export function repointSnapshotPhoto(snapshotJsonText: string, oldPhoto: string | null, newPhoto: string | null): string {
  if (!oldPhoto) return snapshotJsonText;
  try {
    const s = JSON.parse(snapshotJsonText) as { model?: { person?: { photoFile?: string | null } } };
    if (s.model?.person?.photoFile !== oldPhoto) return snapshotJsonText;
    s.model.person.photoFile = newPhoto;
    return JSON.stringify(s);
  } catch {
    return snapshotJsonText;
  }
}

/**
 * A short fingerprint of the user's data (every table except `settings`, which holds phone preferences), for the dev-only
 * round-trip check A10: the same rows → the same text, before a backup and after its restore. cyrb53 over the JSON of the
 * rows in key order; not a security hash.
 */
export function dataFingerprint(data: BackupData): string {
  const text = JSON.stringify(TABLE_ORDER.filter((t) => t !== 'settings').map((t) => data[t] ?? []));
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** What "Delete all data" and the safety copy need to know about the phone's data. */
export type DataCounts = { sections: number; entries: number; versions: number; coverLetters: number; exports: number; hasData: boolean };

export function countData(data: BackupData): DataCounts {
  const n = (table: string) => data[table]?.length ?? 0;
  const named = n('profile') > 0 && String(data.profile[0].full_name ?? '').trim() !== '';
  return {
    sections: n('sections'),
    entries: n('entries'),
    versions: n('versions'),
    coverLetters: n('cover_letters'),
    exports: n('exports'),
    hasData: named || n('sections') > 0 || n('versions') > 0 || n('cover_letters') > 0,
  };
}
