/**
 * @jest-environment node
 */
// A2 (SPEC §12): 500 random sequences of master edits + version edits on the real data functions (Node SQLite)
// and, in parallel, on a naive reference model (test/resolve-reference.ts). After every version-only operation the
// master rows are byte-identical; every 10 operations and at the end, every version resolves exactly as the model
// says (content, order, include flags, "new"/"changed" badges); resolve is deterministic; and "Apply to master"
// equals editing the master + clearing the override (+ marking it seen in that version, D31).
import { resolveVersion, type ResolvedVersion } from '@/engine/resolve';
import type { Master, SectionKind } from '@/engine/types';

import { createTestDb } from '../../test/node-sqlite-db';
import {
  allBullets,
  allEntries,
  cascade,
  copyVersion,
  emptyModel,
  entryOf,
  FIELDS,
  modelResolve,
  moveInArray,
  newVersion,
  sectionOf,
  versionSiblings,
  type Field,
  type MEntry,
  type Model,
  type Projected,
} from '../../test/resolve-reference';

import { addBullet, deleteBullet, listBullets, moveBullet, updateBullet } from './bullets';
import { addEntry, deleteEntry, duplicateEntry, moveEntry, updateEntry } from './entries';
import { addExport } from './exports';
import { loadMaster, loadVersionState } from './load';
import { openDatabase } from './migrations';
import { updateProfile } from './profile';
import { addSection, deleteSection, moveSection, renameSection } from './sections';
import type { Db } from './types';
import {
  applyBulletOverrideToMaster,
  applyEntryOverrideToMaster,
  applyProfileOverrideToMaster,
  markEntrySeen,
  moveBulletInVersion,
  moveEntryInVersion,
  moveSectionInVersion,
  setBulletIncluded,
  setBulletOverride,
  setEntryIncluded,
  setEntryOverride,
  setSectionIncluded,
  setSectionTitleOverride,
} from './version-items';
import { createVersion, duplicateVersion, updateVersion } from './versions';

// ---- seedable RNG (V1_PLAN P1 fallback rule: fixed seeds, reproducible) ----------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const int = (rng: Rng, n: number) => Math.floor(rng() * n);
const pick = <T>(rng: Rng, items: readonly T[]): T => items[int(rng, items.length)];

// ---- operations ---------------------------------------------------------------------------------------------------

type Op =
  | { k: 'addSection'; kind: SectionKind }
  | { k: 'renameSection'; id: number; title: string | null }
  | { k: 'moveSection'; id: number; to: number }
  | { k: 'deleteSection'; id: number }
  | { k: 'addEntry'; sectionId: number; title: string }
  | { k: 'updateEntry'; id: number; field: Field; value: string }
  | { k: 'moveEntry'; id: number; to: number }
  | { k: 'duplicateEntry'; id: number }
  | { k: 'deleteEntry'; id: number }
  | { k: 'addBullet'; entryId: number; text: string; at?: number }
  | { k: 'updateBullet'; id: number; text: string }
  | { k: 'moveBullet'; id: number; to: number }
  | { k: 'deleteBullet'; id: number }
  | { k: 'profile'; field: 'headline' | 'summary'; value: string }
  | { k: 'createVersion' }
  | { k: 'duplicateVersion'; vid: number }
  | { k: 'sectionIncluded'; vid: number; id: number; on: boolean }
  | { k: 'sectionTitle'; vid: number; id: number; title: string | null }
  | { k: 'moveSectionV'; vid: number; id: number; to: number }
  | { k: 'entryIncluded'; vid: number; id: number; on: boolean }
  | { k: 'moveEntryV'; vid: number; id: number; to: number }
  | { k: 'entryOverride'; vid: number; id: number; field: Field; value: string | null }
  | { k: 'bulletIncluded'; vid: number; id: number; on: boolean }
  | { k: 'moveBulletV'; vid: number; id: number; to: number }
  | { k: 'bulletOverride'; vid: number; id: number; text: string | null }
  | { k: 'profileOverride'; vid: number; field: 'headline' | 'summary'; value: string | null }
  | { k: 'seen'; vid: number; id: number }
  | { k: 'export'; vid: number }
  | { k: 'applyEntry'; vid: number; id: number; fields: Field[] }
  | { k: 'applyBullet'; vid: number; id: number }
  | { k: 'applyProfile'; vid: number; field: 'headline' | 'summary' };

const MASTER_OPS = new Set<Op['k']>([
  'addSection', 'renameSection', 'moveSection', 'deleteSection', 'addEntry', 'updateEntry', 'moveEntry', 'duplicateEntry',
  'deleteEntry', 'addBullet', 'updateBullet', 'moveBullet', 'deleteBullet', 'profile', 'applyEntry', 'applyBullet', 'applyProfile',
]);

const TEXTS = ['Lead', 'Picker', 'ACME', '', 'Berlin', 'Shift lead'];
const BULLET_TEXTS = ['Led a team', 'Cut errors by 30%', 'Trained staff', 'Ran inventory'];
const OVERRIDES = ['Tailored', 'Shift lead', '', 'ACME'];
const BULLET_OVERRIDES = ['Tailored bullet', 'Led 15 people', ' ', '', null];
const TITLES = ['Tools', 'Skills', ' ', null];
const KINDS: SectionKind[] = ['experience', 'education', 'skills', 'projects', 'custom'];

/** A random operation that is valid in the current model state. */
function generate(rng: Rng, m: Model): Op {
  const versions = [...m.versions.keys()];
  const entries = allEntries(m);
  const bullets = allBullets(m).map((b) => b.bullet);
  const anyVersion = () => pick(rng, versions);
  const options: [number, () => Op | null][] = [
    [3, () => ({ k: 'addSection', kind: pick(rng, KINDS) })],
    [2, () => (m.sections.length ? { k: 'renameSection', id: pick(rng, m.sections).id, title: pick(rng, TITLES) } : null)],
    [2, () => (m.sections.length ? { k: 'moveSection', id: pick(rng, m.sections).id, to: int(rng, m.sections.length + 2) - 1 } : null)],
    [1, () => (m.sections.length > 1 ? { k: 'deleteSection', id: pick(rng, m.sections).id } : null)],
    [6, () => (m.sections.length ? { k: 'addEntry', sectionId: pick(rng, m.sections).id, title: pick(rng, TEXTS) } : null)],
    [8, () => (entries.length ? { k: 'updateEntry', id: pick(rng, entries).id, field: pick(rng, FIELDS), value: pick(rng, TEXTS) } : null)],
    [3, () => (entries.length ? { k: 'moveEntry', id: pick(rng, entries).id, to: int(rng, 5) - 1 } : null)],
    [1, () => (entries.length ? { k: 'duplicateEntry', id: pick(rng, entries).id } : null)],
    [2, () => (entries.length > 1 ? { k: 'deleteEntry', id: pick(rng, entries).id } : null)],
    [6, () => (entries.length ? { k: 'addBullet', entryId: pick(rng, entries).id, text: pick(rng, BULLET_TEXTS), at: rng() < 0.3 ? int(rng, 4) : undefined } : null)],
    [6, () => (bullets.length ? { k: 'updateBullet', id: pick(rng, bullets).id, text: pick(rng, BULLET_TEXTS) } : null)],
    [3, () => (bullets.length ? { k: 'moveBullet', id: pick(rng, bullets).id, to: int(rng, 5) - 1 } : null)],
    [2, () => (bullets.length > 1 ? { k: 'deleteBullet', id: pick(rng, bullets).id } : null)],
    [2, () => ({ k: 'profile', field: pick(rng, ['headline', 'summary'] as const), value: pick(rng, TEXTS) })],
    [1, () => (versions.length < 3 ? { k: 'createVersion' } : null)],
    [1, () => (versions.length && versions.length < 4 ? { k: 'duplicateVersion', vid: anyVersion() } : null)],
    [3, () => (versions.length && m.sections.length ? { k: 'sectionIncluded', vid: anyVersion(), id: pick(rng, m.sections).id, on: rng() < 0.4 } : null)],
    [2, () => (versions.length && m.sections.length ? { k: 'sectionTitle', vid: anyVersion(), id: pick(rng, m.sections).id, title: pick(rng, TITLES) } : null)],
    [3, () => (versions.length && m.sections.length ? { k: 'moveSectionV', vid: anyVersion(), id: pick(rng, m.sections).id, to: int(rng, 5) - 1 } : null)],
    [5, () => (versions.length && entries.length ? { k: 'entryIncluded', vid: anyVersion(), id: pick(rng, entries).id, on: rng() < 0.4 } : null)],
    [4, () => (versions.length && entries.length ? { k: 'moveEntryV', vid: anyVersion(), id: pick(rng, entries).id, to: int(rng, 5) - 1 } : null)],
    [8, () => versions.length && entries.length
      ? { k: 'entryOverride', vid: anyVersion(), id: pick(rng, entries).id, field: pick(rng, FIELDS), value: rng() < 0.2 ? null : pick(rng, OVERRIDES) }
      : null],
    [4, () => (versions.length && bullets.length ? { k: 'bulletIncluded', vid: anyVersion(), id: pick(rng, bullets).id, on: rng() < 0.4 } : null)],
    [3, () => (versions.length && bullets.length ? { k: 'moveBulletV', vid: anyVersion(), id: pick(rng, bullets).id, to: int(rng, 5) - 1 } : null)],
    [6, () => (versions.length && bullets.length ? { k: 'bulletOverride', vid: anyVersion(), id: pick(rng, bullets).id, text: pick(rng, BULLET_OVERRIDES) } : null)],
    [2, () => versions.length
      ? { k: 'profileOverride', vid: anyVersion(), field: pick(rng, ['headline', 'summary'] as const), value: rng() < 0.3 ? null : pick(rng, OVERRIDES) }
      : null],
    [2, () => (versions.length && entries.length ? { k: 'seen', vid: anyVersion(), id: pick(rng, entries).id } : null)],
    [2, () => (versions.length ? { k: 'export', vid: anyVersion() } : null)],
    [4, () => versions.length && entries.length
      ? { k: 'applyEntry', vid: anyVersion(), id: pick(rng, entries).id, fields: rng() < 0.5 ? [...FIELDS] : [pick(rng, FIELDS)] }
      : null],
    [3, () => (versions.length && bullets.length ? { k: 'applyBullet', vid: anyVersion(), id: pick(rng, bullets).id } : null)],
    [1, () => (versions.length ? { k: 'applyProfile', vid: anyVersion(), field: pick(rng, ['headline', 'summary'] as const) } : null)],
  ];
  const total = options.reduce((sum, [w]) => sum + w, 0);
  for (;;) {
    let r = rng() * total;
    const option = options.find(([w]) => (r -= w) < 0) ?? options[0];
    const op = option[1]();
    if (op) return op;
  }
}

/** Runs the operation on the database; returns new ids (row id, and bullet ids of a duplicated entry). */
async function runDb(db: Db, op: Op, now: number): Promise<{ id?: number; bulletIds?: number[] }> {
  switch (op.k) {
    case 'addSection': return { id: await addSection(db, op.kind) };
    case 'renameSection': await renameSection(db, op.id, op.title); return {};
    case 'moveSection': await moveSection(db, op.id, op.to); return {};
    case 'deleteSection': await deleteSection(db, op.id); return {};
    case 'addEntry': return { id: await addEntry(db, op.sectionId, { title: op.title }, now) };
    case 'updateEntry': await updateEntry(db, op.id, { [op.field]: op.value }, now); return {};
    case 'moveEntry': await moveEntry(db, op.id, op.to); return {};
    case 'duplicateEntry': {
      const id = await duplicateEntry(db, op.id, now);
      return { id, bulletIds: (await listBullets(db, id)).map((b) => b.id) };
    }
    case 'deleteEntry': await deleteEntry(db, op.id); return {};
    case 'addBullet': return { id: await addBullet(db, op.entryId, op.text, now, op.at) };
    case 'updateBullet': await updateBullet(db, op.id, op.text, now); return {};
    case 'moveBullet': await moveBullet(db, op.id, op.to, now); return {};
    case 'deleteBullet': await deleteBullet(db, op.id, now); return {};
    case 'profile': await updateProfile(db, { [op.field]: op.value }, now); return {};
    case 'createVersion': return { id: await createVersion(db, { name: 'V' }, now) };
    case 'duplicateVersion': return { id: await duplicateVersion(db, op.vid, now) };
    case 'sectionIncluded': await setSectionIncluded(db, op.vid, op.id, op.on, now); return {};
    case 'sectionTitle': await setSectionTitleOverride(db, op.vid, op.id, op.title, now); return {};
    case 'moveSectionV': await moveSectionInVersion(db, op.vid, op.id, op.to, now); return {};
    case 'entryIncluded': await setEntryIncluded(db, op.vid, op.id, op.on, now); return {};
    case 'moveEntryV': await moveEntryInVersion(db, op.vid, op.id, op.to, now); return {};
    case 'entryOverride': await setEntryOverride(db, op.vid, op.id, op.field, op.value, now); return {};
    case 'bulletIncluded': await setBulletIncluded(db, op.vid, op.id, op.on, now); return {};
    case 'moveBulletV': await moveBulletInVersion(db, op.vid, op.id, op.to, now); return {};
    case 'bulletOverride': await setBulletOverride(db, op.vid, op.id, op.text, now); return {};
    case 'profileOverride':
      await updateVersion(db, op.vid, op.field === 'headline' ? { headlineOverride: op.value } : { summaryOverride: op.value }, now);
      return {};
    case 'seen': await markEntrySeen(db, op.vid, op.id, now); return {};
    case 'export':
      await addExport(db, { versionId: op.vid, coverLetterId: null, kind: 'resume_pdf', filePath: null, fileName: 'x.pdf', pageCount: 1, bytes: 1, snapshotJson: '{}', readbackJson: null }, now);
      return {};
    case 'applyEntry': await applyEntryOverrideToMaster(db, op.vid, op.id, op.fields, now); return {};
    case 'applyBullet': await applyBulletOverrideToMaster(db, op.vid, op.id, now); return {};
    case 'applyProfile': await applyProfileOverrideToMaster(db, op.vid, op.field, now); return {};
  }
}

const isBlank = (s: string | null) => s === null || s.trim() === '';

/** The same operation on the reference model. */
function runModel(m: Model, op: Op, now: number, ids: { id?: number; bulletIds?: number[] }) {
  const bump = (e: MEntry) => (e.updatedAt = now);
  const v = 'vid' in op ? m.versions.get(op.vid)! : undefined;
  switch (op.k) {
    case 'addSection': m.sections.push({ id: ids.id!, kind: op.kind, customTitle: null, entries: [] }); return;
    case 'renameSection': m.sections.find((s) => s.id === op.id)!.customTitle = isBlank(op.title) ? null : op.title!.trim(); return;
    case 'moveSection': m.sections = moveInArray(m.sections, m.sections.find((s) => s.id === op.id)!, op.to); return;
    case 'deleteSection': m.sections = m.sections.filter((s) => s.id !== op.id); cascade(m); return;
    case 'addEntry':
      m.sections.find((s) => s.id === op.sectionId)!.entries.push({
        id: ids.id!, title: op.title, organization: '', location: '', description: '', createdAt: now, updatedAt: now, bullets: [],
      });
      return;
    case 'updateEntry': {
      const e = allEntries(m).find((x) => x.id === op.id)!;
      if (e[op.field] !== op.value) { e[op.field] = op.value; bump(e); }
      return;
    }
    case 'moveEntry': {
      const s = sectionOf(m, op.id);
      s.entries = moveInArray(s.entries, s.entries.find((e) => e.id === op.id)!, op.to);
      return;
    }
    case 'duplicateEntry': {
      const s = sectionOf(m, op.id);
      const i = s.entries.findIndex((e) => e.id === op.id);
      const e = s.entries[i];
      s.entries.splice(i + 1, 0, { ...e, id: ids.id!, createdAt: now, updatedAt: now, bullets: e.bullets.map((b, j) => ({ id: ids.bulletIds![j], text: b.text })) });
      return;
    }
    case 'deleteEntry': { const s = sectionOf(m, op.id); s.entries = s.entries.filter((e) => e.id !== op.id); cascade(m); return; }
    case 'addBullet': {
      const e = allEntries(m).find((x) => x.id === op.entryId)!;
      const at = op.at === undefined ? e.bullets.length : Math.min(e.bullets.length, op.at);
      e.bullets.splice(at, 0, { id: ids.id!, text: op.text });
      bump(e);
      return;
    }
    case 'updateBullet': {
      const e = entryOf(m, op.id);
      const b = e.bullets.find((x) => x.id === op.id)!;
      if (b.text !== op.text) { b.text = op.text; bump(e); }
      return;
    }
    case 'moveBullet': {
      const e = entryOf(m, op.id);
      const next = moveInArray(e.bullets, e.bullets.find((x) => x.id === op.id)!, op.to);
      if (next.some((b, i) => b !== e.bullets[i])) { e.bullets = next; bump(e); }
      return;
    }
    case 'deleteBullet': { const e = entryOf(m, op.id); e.bullets = e.bullets.filter((b) => b.id !== op.id); bump(e); cascade(m); return; }
    case 'profile': m[op.field] = op.value; return;
    case 'createVersion': m.versions.set(ids.id!, newVersion(ids.id!, now)); return;
    case 'duplicateVersion': m.versions.set(ids.id!, copyVersion(v!, ids.id!, now)); return;
    case 'sectionIncluded': if (op.on) v!.hidden.delete(`S:${op.id}`); else v!.hidden.add(`S:${op.id}`); return;
    case 'sectionTitle': if (isBlank(op.title)) v!.titleOverride.delete(op.id); else v!.titleOverride.set(op.id, op.title!.trim()); return;
    case 'moveSectionV': v!.pinned.set('S', moveInArray(versionSiblings(v!, 'S', m.sections).map((s) => s.id), op.id, op.to)); return;
    case 'entryIncluded': if (op.on) v!.hidden.delete(`E:${op.id}`); else v!.hidden.add(`E:${op.id}`); return;
    case 'moveEntryV': {
      const s = sectionOf(m, op.id);
      v!.pinned.set(`E:${s.id}`, moveInArray(versionSiblings(v!, `E:${s.id}`, s.entries).map((e) => e.id), op.id, op.to));
      return;
    }
    case 'entryOverride': {
      const o = { ...(v!.overrides.get(op.id) ?? {}) };
      if (op.value === null) delete o[op.field]; else o[op.field] = op.value;
      v!.overrides.set(op.id, o);
      return;
    }
    case 'bulletIncluded': if (op.on) v!.hidden.delete(`B:${op.id}`); else v!.hidden.add(`B:${op.id}`); return;
    case 'moveBulletV': {
      const e = entryOf(m, op.id);
      v!.pinned.set(`B:${e.id}`, moveInArray(versionSiblings(v!, `B:${e.id}`, e.bullets).map((b) => b.id), op.id, op.to));
      return;
    }
    case 'bulletOverride': if (isBlank(op.text)) v!.bulletText.delete(op.id); else v!.bulletText.set(op.id, op.text!); return;
    case 'profileOverride': if (op.field === 'headline') v!.headlineOverride = op.value; else v!.summaryOverride = op.value; return;
    case 'seen': v!.seen.set(op.id, now); return;
    case 'export': v!.lastExportedAt = now; return;
    case 'applyEntry': {
      const o = { ...(v!.overrides.get(op.id) ?? {}) };
      const fields = op.fields.filter((f) => o[f] !== undefined);
      if (fields.length === 0) return;
      const e = allEntries(m).find((x) => x.id === op.id)!;
      let changed = false;
      for (const f of fields) {
        if (e[f] !== o[f]) { e[f] = o[f]!; changed = true; }
        delete o[f];
      }
      if (changed) bump(e);
      v!.overrides.set(op.id, o);
      v!.seen.set(op.id, now);
      return;
    }
    case 'applyBullet': {
      const text = v!.bulletText.get(op.id);
      if (text === undefined) return;
      const e = entryOf(m, op.id);
      const b = e.bullets.find((x) => x.id === op.id)!;
      if (b.text !== text) { b.text = text; bump(e); }
      v!.bulletText.delete(op.id);
      v!.seen.set(e.id, now);
      return;
    }
    case 'applyProfile': {
      const value = op.field === 'headline' ? v!.headlineOverride : v!.summaryOverride;
      if (value === null) return;
      m[op.field] = value;
      if (op.field === 'headline') v!.headlineOverride = null; else v!.summaryOverride = null;
      return;
    }
  }
}

// ---- comparison helpers ---------------------------------------------------------------------------------------------

function project(r: ResolvedVersion): Projected {
  return {
    headline: r.headline,
    summary: r.summary,
    sections: r.sections.map((s) => ({
      id: s.id,
      title: s.title,
      included: s.included,
      entries: s.entries.map((e) => ({
        id: e.id,
        included: e.included,
        title: e.title,
        organization: e.organization,
        location: e.location,
        description: e.description,
        newSinceExport: e.newSinceExport,
        masterChanged: e.masterChanged,
        bullets: e.bullets.map((b) => ({ id: b.id, text: b.text, included: b.included })),
      })),
    })),
  };
}

async function masterRows(db: Db): Promise<string> {
  const tables = ['profile', 'profile_links', 'sections', 'entries', 'bullets'];
  const rows = await Promise.all(tables.map((t) => db.getAllAsync(`SELECT * FROM ${t} ORDER BY rowid`)));
  return JSON.stringify(rows);
}

async function resolvedAll(db: Db): Promise<Map<number, ResolvedVersion>> {
  const master = await loadMaster(db);
  const ids = (await db.getAllAsync<{ id: number }>('SELECT id FROM versions ORDER BY id')).map((r) => r.id);
  const out = new Map<number, ResolvedVersion>();
  for (const id of ids) out.set(id, resolveVersion(master, await loadVersionState(db, id)));
  return out;
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const BOOTSTRAP: ((m: Model) => Op)[] = [
  () => ({ k: 'createVersion' }),
  () => ({ k: 'addSection', kind: 'experience' }),
  () => ({ k: 'addSection', kind: 'skills' }),
  (m) => ({ k: 'addEntry', sectionId: m.sections[0].id, title: 'Lead' }),
  (m) => ({ k: 'addEntry', sectionId: m.sections[0].id, title: 'Picker' }),
  (m) => ({ k: 'addEntry', sectionId: m.sections[1].id, title: 'Tools' }),
  (m) => ({ k: 'addBullet', entryId: m.sections[0].entries[0].id, text: 'Led a team' }),
  (m) => ({ k: 'addBullet', entryId: m.sections[0].entries[0].id, text: 'Trained staff' }),
  (m) => ({ k: 'addBullet', entryId: m.sections[1].entries[0].id, text: 'Ran inventory' }),
];

type Run = { db: Db; model: Model; ops: { op: Op; now: number }[] };

/** One random sequence; checks invariants as it goes. Returns the DB, model and the concrete op log. */
async function runSequence(seed: number, length: number, stats: Record<string, number>): Promise<Run> {
  const rng = mulberry32(seed);
  const db = createTestDb();
  await openDatabase(db);
  const model = emptyModel();
  const ops: Run['ops'] = [];
  let now = 1_000_000;
  for (let i = 0; i < BOOTSTRAP.length + length; i++) {
    now += 1 + int(rng, 3);
    const op = i < BOOTSTRAP.length ? BOOTSTRAP[i](model) : generate(rng, model);
    const versionOnly = !MASTER_OPS.has(op.k);
    const before = versionOnly ? await masterRows(db) : '';
    const ids = await runDb(db, op, now);
    runModel(model, op, now, ids);
    ops.push({ op, now });
    stats.ops++;
    if (versionOnly) {
      stats.versionOps++;
      expect([seed, i, op.k, await masterRows(db)]).toEqual([seed, i, op.k, before]); // A2: master untouched
    }
    if (i % 10 === 9 || i === BOOTSTRAP.length + length - 1) {
      for (const [id, resolved] of await resolvedAll(db)) {
        expect([seed, i, id, project(resolved)]).toEqual([seed, i, id, modelResolve(model, id)]);
        stats.comparisons++;
      }
    }
  }
  return { db, model, ops };
}

async function replay(ops: Run['ops']): Promise<Db> {
  const db = createTestDb();
  await openDatabase(db);
  for (const { op, now } of ops) await runDb(db, op, now);
  return db;
}

describe('A2 property test: version resolution (SPEC §5.1)', () => {
  const SEQUENCES = 500;
  const LENGTH = 30;

  it(`${SEQUENCES} random edit sequences: master untouched by version edits, resolution = reference model, deterministic`, async () => {
    const stats = { ops: 0, versionOps: 0, comparisons: 0, determinism: 0 };
    const kinds = new Set<string>();
    for (let seed = 1; seed <= SEQUENCES; seed++) {
      const { db, ops } = await runSequence(seed, LENGTH, stats);
      ops.forEach(({ op }) => kinds.add(op.k));
      // Deterministic: the same data in any row order resolves identically, every time.
      const rng = mulberry32(seed * 7919);
      const master = await loadMaster(db);
      for (const id of (await db.getAllAsync<{ id: number }>('SELECT id FROM versions')).map((r) => r.id)) {
        const state = await loadVersionState(db, id);
        const shuffledMaster: Master = {
          ...master,
          links: shuffled(rng, master.links),
          sections: shuffled(rng, master.sections),
          entries: shuffled(rng, master.entries),
          bullets: shuffled(rng, master.bullets),
        };
        const shuffledState = { ...state, sections: shuffled(rng, state.sections), entries: shuffled(rng, state.entries), bullets: shuffled(rng, state.bullets) };
        const a = JSON.stringify(resolveVersion(master, state));
        expect(JSON.stringify(resolveVersion(master, state))).toBe(a);
        expect(JSON.stringify(resolveVersion(shuffledMaster, shuffledState))).toBe(a);
        stats.determinism++;
      }
    }
    expect(kinds.size).toBe(31); // every operation kind was exercised
    expect(stats.ops).toBe(SEQUENCES * (BOOTSTRAP.length + LENGTH));
    console.log('A2 stats', JSON.stringify(stats));
  }, 300_000);

  it('"Apply to master" equals editing the master + clearing the override (+ seen) — 50 sequences, entries and bullets', async () => {
    const stats = { ops: 0, versionOps: 0, comparisons: 0 };
    let entryCases = 0;
    let bulletCases = 0;
    for (let seed = 1001; seed <= 1050; seed++) {
      const rng = mulberry32(seed);
      const a = await runSequence(seed, 20, stats);
      const b = await replay(a.ops);
      expect(await masterRows(b)).toBe(await masterRows(a.db));
      let now = a.ops[a.ops.length - 1].now + 10;
      const vid = pick(rng, [...a.model.versions.keys()]);
      if (allEntries(a.model).length === 0) {
        // Section deletes can leave no entry at all: add one (to both databases and the model).
        const op: Op = { k: 'addEntry', sectionId: a.model.sections[0].id, title: 'Lead' };
        now++;
        runModel(a.model, op, now, await runDb(a.db, op, now));
        await runDb(b, op, now);
      }
      const entry = pick(rng, allEntries(a.model));
      const bulletRef = allBullets(a.model)[0];
      // Make sure there is something to apply, on both databases.
      const setup: Op[] = [
        { k: 'entryOverride', vid, id: entry.id, field: pick(rng, FIELDS), value: pick(rng, ['Tailored', '', 'ACME']) },
        ...(bulletRef ? [{ k: 'bulletOverride', vid, id: bulletRef.bullet.id, text: 'Tailored bullet' } as Op] : []),
      ];
      for (const op of setup) {
        now++;
        await runDb(a.db, op, now);
        await runDb(b, op, now);
      }
      now++;
      // A: Apply to master.
      await applyEntryOverrideToMaster(a.db, vid, entry.id, FIELDS, now);
      // B: edit the master directly, clear the overrides, mark seen.
      const { overrides } = (await loadVersionState(b, vid)).entries.find((r) => r.entryId === entry.id)!;
      await updateEntry(b, entry.id, overrides, now);
      for (const f of FIELDS) await setEntryOverride(b, vid, entry.id, f, null, now);
      await markEntrySeen(b, vid, entry.id, now);
      entryCases++;
      if (bulletRef) {
        now++;
        const text = (await loadVersionState(b, vid)).bullets.find((r) => r.bulletId === bulletRef.bullet.id)!.textOverride!;
        await applyBulletOverrideToMaster(a.db, vid, bulletRef.bullet.id, now);
        await updateBullet(b, bulletRef.bullet.id, text, now);
        await setBulletOverride(b, vid, bulletRef.bullet.id, null, now);
        await markEntrySeen(b, vid, bulletRef.entry.id, now);
        bulletCases++;
      }
      expect(await loadMaster(a.db)).toEqual(await loadMaster(b));
      const ra = await resolvedAll(a.db);
      const rb = await resolvedAll(b);
      expect([...ra.keys()]).toEqual([...rb.keys()]);
      for (const [id, resolved] of ra) expect([seed, id, resolved]).toEqual([seed, id, rb.get(id)]);
    }
    expect(entryCases).toBe(50);
    expect(bulletCases).toBeGreaterThan(40);
  }, 300_000);
});
