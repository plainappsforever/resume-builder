import { withTransaction } from './tx';
import type { Db } from './types';

// Append-only. Never edit a migration that has shipped; add a new one instead.
export const MIGRATIONS: readonly string[] = [
  // 1 — template (mobile-starter): demo items + settings.
  `CREATE TABLE items (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   );
   CREATE TABLE settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  // 2 — v1 P1: master profile, versions (deviations only, D17), keywords, cover letters, exports (V1_PLAN Architecture).
  // Timestamps are epoch milliseconds.
  `DROP TABLE items;                                   -- template demo table, never shipped
   CREATE TABLE profile (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     full_name TEXT NOT NULL DEFAULT '', headline TEXT NOT NULL DEFAULT '',
     email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
     city TEXT NOT NULL DEFAULT '', region TEXT NOT NULL DEFAULT '', country_code TEXT NOT NULL DEFAULT '',
     birth_date TEXT, nationality TEXT, show_personal INTEGER NOT NULL DEFAULT 0,
     photo_file TEXT,                                  -- relative to Paths.document
     summary TEXT NOT NULL DEFAULT '', is_example INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE profile_links (
     id INTEGER PRIMARY KEY AUTOINCREMENT, position INTEGER NOT NULL,
     label TEXT NOT NULL CHECK (label IN ('linkedin','website','github','portfolio','other')),
     custom_label TEXT, url TEXT NOT NULL
   );
   CREATE TABLE sections (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kind TEXT NOT NULL CHECK (kind IN ('experience','education','projects','skills','certifications',
       'languages','awards','publications','volunteer','interests','references','custom')),
     custom_title TEXT, position INTEGER NOT NULL
   );
   CREATE TABLE entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     title TEXT NOT NULL DEFAULT '', organization TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
     start_date TEXT CHECK (start_date IS NULL OR start_date GLOB '[12][0-9][0-9][0-9]'
                            OR start_date GLOB '[12][0-9][0-9][0-9]-[01][0-9]'),
     end_date TEXT CHECK (end_date IS NULL OR end_date GLOB '[12][0-9][0-9][0-9]'
                          OR end_date GLOB '[12][0-9][0-9][0-9]-[01][0-9]'),
     is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current = 0 OR end_date IS NULL),
     url TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', extra_json TEXT NOT NULL DEFAULT '{}',
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
   );
   CREATE TABLE bullets (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
     position INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
   );
   CREATE TABLE versions (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
     target_company TEXT NOT NULL DEFAULT '', target_role TEXT NOT NULL DEFAULT '', job_ad TEXT NOT NULL DEFAULT '',
     language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','de')),
     template TEXT NOT NULL DEFAULT 'modern'
       CHECK (template IN ('classic','modern','compact','executive','lebenslauf','plain')),
     style_json TEXT NOT NULL DEFAULT '{}',            -- font, accent, sizeStep, marginStep, spacingStep,
                                                       -- headingCase, photo, paper, dateStyle
     headline_override TEXT, summary_override TEXT,
     source_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
     archived INTEGER NOT NULL DEFAULT 0, is_example INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_exported_at INTEGER
   );
   CREATE TABLE version_sections (
     version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
     section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
     included INTEGER NOT NULL DEFAULT 1, position INTEGER, title_override TEXT,
     page_break_before INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (version_id, section_id)
   );
   CREATE TABLE version_entries (
     version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
     entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
     included INTEGER NOT NULL DEFAULT 1, position INTEGER,
     override_json TEXT NOT NULL DEFAULT '{}',          -- title/organization/location/description
     seen_master_at INTEGER,                            -- for the "changed in master" badge
     PRIMARY KEY (version_id, entry_id)
   );
   CREATE TABLE version_bullets (
     version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
     bullet_id INTEGER NOT NULL REFERENCES bullets(id) ON DELETE CASCADE,
     included INTEGER NOT NULL DEFAULT 1, position INTEGER, text_override TEXT,
     PRIMARY KEY (version_id, bullet_id)
   );
   CREATE TABLE version_keywords (
     version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
     term TEXT NOT NULL,                                -- normalised phrase
     source TEXT NOT NULL CHECK (source IN ('auto','added')),
     state TEXT NOT NULL DEFAULT 'normal' CHECK (state IN ('normal','pinned','ignored')),
     PRIMARY KEY (version_id, term)
   );
   CREATE TABLE cover_letters (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
     language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','de')),
     recipient_company TEXT NOT NULL DEFAULT '', contact_person TEXT NOT NULL DEFAULT '',
     address TEXT NOT NULL DEFAULT '', letter_date TEXT, subject TEXT NOT NULL DEFAULT '',
     salutation TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', closing TEXT NOT NULL DEFAULT '',
     signature_name TEXT NOT NULL DEFAULT '', is_example INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
   );
   CREATE TABLE exports (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     version_id INTEGER REFERENCES versions(id) ON DELETE CASCADE,
     cover_letter_id INTEGER REFERENCES cover_letters(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('resume_pdf','cover_pdf','plain_text')),
     file_path TEXT, file_name TEXT NOT NULL, page_count INTEGER, bytes INTEGER,
     snapshot_json TEXT NOT NULL, readback_json TEXT, created_at INTEGER NOT NULL,
     CHECK ((version_id IS NULL) <> (cover_letter_id IS NULL))
   );
   CREATE INDEX entries_section ON entries(section_id, position);
   CREATE INDEX bullets_entry ON bullets(entry_id, position);
   CREATE INDEX exports_version ON exports(version_id, created_at);`,
];

export const LATEST_VERSION = MIGRATIONS.length;

export async function migrate(db: Db, migrations: readonly string[] = MIGRATIONS): Promise<void> {
  // The version is read INSIDE each unit: another JS handle on the same connection (e.g. a background task at a cold
  // start) may have migrated meanwhile, and a migration must never run twice. One transaction per migration: a
  // failure rolls back both the schema change and user_version.
  for (;;) {
    const applied = await withTransaction(db, async (tx) => {
      const row = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const version = row?.user_version ?? 0;
      if (version >= migrations.length) return false;
      await tx.execAsync(`${migrations[version]} PRAGMA user_version = ${version + 1};`);
      return true;
    });
    if (!applied) return;
  }
}

/**
 * Opens the app database: foreign keys ON (cascades and SET NULL rely on it; SQLite cannot switch it inside a
 * transaction, so it runs first, outside the write queue's transactions), then the missing migrations.
 */
export async function openDatabase(db: Db): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
}
