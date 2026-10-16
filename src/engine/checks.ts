// Structure and content checks C1–C15 (SPEC §5.5, D40). PURE. Each check names its source (L26: what was checked
// and who says so); nothing here is a score, and nothing blocks export except a missing name (D19).
import type { TranslationKey } from '@/i18n/en';
import type { ReadbackResult } from '@/readback/compare';

import { ACTION_WORD_FORMS } from './content/action-verbs';
import { parsePartialDate, type PartialDate } from './dates';
import type { RenderModel } from './resolve';
import { FONT_COVERAGE } from './font-coverage.generated';
import { effectiveFont, type FontId } from './style';

export const CHECK_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** needs attention · info · warning (C4, "your choice"). */
export type Severity = 'attention' | 'info' | 'warning';
export type CheckStatus = 'ok' | 'notChecked' | Severity;

export type SourceId = 'greenhouse' | 'greenhouseWorkday' | 'commonPractice' | 'commonAdvice' | 'readback' | 'basic';

/** Where the user fixes a finding ("every check opens the place to fix it"). */
export type FixTarget =
  | { kind: 'profile'; field: 'fullName' | 'headline' | 'email' | 'phone' | 'city' | 'region' | 'nationality' | 'summary' }
  | { kind: 'link'; index: number }
  | { kind: 'section'; sectionId: number }
  | { kind: 'entry'; entryId: number; field: string | null }
  | { kind: 'bullet'; entryId: number; bulletId: number }
  | { kind: 'design' }
  | { kind: 'export' };

export type Finding = {
  code: string;
  severity: Severity;
  target: FixTarget;
  messageKey: TranslationKey;
  params: Record<string, string | number>;
};

export type CheckResult = {
  id: CheckId;
  titleKey: TranslationKey;
  sourceKey: TranslationKey;
  /** Source page for "Greenhouse"/"Workday" checks (RESEARCH §2.1). */
  sourceUrls: readonly string[];
  status: CheckStatus;
  /** C2/C3: always ✓ because every template guarantees it (the reason is the message). */
  guaranteed: boolean;
  /** Message for ✓ / not checked (findings carry their own). */
  noteKey: TranslationKey | null;
  findings: Finding[];
};

/** The last export's read-back: the full SPEC §5.7 result (src/readback/compare.ts), or "could not read back". */
export type ReadbackOutcome =
  | ({ pass: boolean; unavailable?: false } & Partial<Pick<ReadbackResult, 'reader' | 'words' | 'lines'>>)
  | { unavailable: true };

export type CheckContext = {
  today: { year: number; month: number };
  /** The last export of this version, if any (C11, C12). */
  lastExport?: { bytes: number; pages: number } | null;
  /** Its read-back result (C15). */
  readback?: ReadbackOutcome | null;
  /**
   * v1.1 (D95, REVIEW_V1 #6): the resume changed since that export (content, master, template, style…): C11, C12 and C15
   * describe an older document and say "not checked — export again" instead of a stale result.
   */
  stale?: boolean;
};

export const SOURCE_URLS = {
  greenhouse: 'https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse',
  workday:
    'https://doc.workday.com/admin-guide/en-us/human-capital-management/recruiting/candidates/set-up-prospects-and-candidates/hdc1552497830785.html',
} as const;

const SOURCES: Record<CheckId, SourceId> = {
  C1: 'greenhouse',
  C2: 'greenhouse',
  C3: 'greenhouseWorkday',
  C4: 'greenhouseWorkday',
  C5: 'greenhouse',
  C6: 'greenhouse',
  C7: 'greenhouse',
  C8: 'commonPractice',
  C9: 'basic',
  C10: 'commonAdvice',
  C11: 'greenhouse',
  C12: 'commonAdvice',
  C13: 'readback',
  C14: 'basic',
  C15: 'readback',
};

const URLS: Record<SourceId, readonly string[]> = {
  greenhouse: [SOURCE_URLS.greenhouse],
  greenhouseWorkday: [SOURCE_URLS.greenhouse, SOURCE_URLS.workday],
  commonPractice: [],
  commonAdvice: [],
  readback: [],
  basic: [],
};

/** Standard section titles (EN/DE) a parser recognises (C5); compared case-insensitively. */
export const STANDARD_HEADINGS: ReadonlySet<string> = new Set([
  'experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history',
  'career history', 'education', 'education and training', 'skills', 'technical skills', 'key skills', 'core skills',
  'projects', 'certifications', 'certificates', 'licenses and certifications', 'languages', 'awards', 'honors',
  'honours', 'awards and honors', 'publications', 'volunteering', 'volunteer experience', 'volunteer work',
  'interests', 'hobbies', 'references', 'summary', 'professional summary', 'profile', 'training', 'courses',
  'additional information', 'berufserfahrung', 'berufliche erfahrung', 'beruflicher werdegang', 'werdegang',
  'praxiserfahrung', 'ausbildung', 'bildung', 'bildungsweg', 'schulbildung', 'studium', 'ausbildung und studium',
  'kenntnisse', 'fähigkeiten', 'kenntnisse und fähigkeiten', 'fachkenntnisse', 'it-kenntnisse', 'edv-kenntnisse',
  'projekte', 'zertifikate', 'zertifizierungen', 'weiterbildung', 'weiterbildungen', 'fort- und weiterbildung',
  'sprachen', 'sprachkenntnisse', 'auszeichnungen', 'veröffentlichungen', 'publikationen', 'ehrenamt',
  'ehrenamtliches engagement', 'engagement', 'interessen', 'hobbys', 'referenzen', 'profil', 'kurzprofil',
  'zusammenfassung', 'persönliche daten',
]);

const ABBREVIATIONS: readonly (readonly [string, string])[] = [
  ['Sr.', 'Senior'],
  ['Jr.', 'Junior'],
  ['Mgr.', 'Manager'],
  ['Asst.', 'Assistant'],
  ['Eng.', 'Engineer'],
  ['Dir.', 'Director'],
  ['VP', 'Vice President'],
];

const FIRST_PERSON: ReadonlySet<string> = new Set(['i', 'my', 'ich', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines']);
const BULLET_SECTIONS: ReadonlySet<string> = new Set(['experience', 'projects', 'volunteer']);
export const MAX_BULLET_LENGTH = 300;
export const MAX_FILE_BYTES = 2_500_000;
export const MAX_PAGES = 2;

// ---- helpers ----------------------------------------------------------------------------------------------------

const blank = (s: string | null | undefined) => s === null || s === undefined || s.trim() === '';
const LETTER = /\p{L}/u;
const codeLength = (s: string) => [...s].length;

/**
 * C13 coverage = what the EMBEDDED font files can show (D44: measured from their character maps by
 * scripts/embed-fonts.mjs, every style, within each subset's unicode-range) — replaces D40's planned table. Tab/line
 * breaks are never printed as glyphs; emoji glue characters are ignored (D40).
 */
const IGNORED_CODEPOINTS = new Set([0x09, 0x0a, 0x0d, 0x200d, 0xfe0e, 0xfe0f, 0x20e3]);

export function isCovered(codePoint: number, font: FontId): boolean {
  return FONT_COVERAGE[font].some(([a, b]) => codePoint >= a && codePoint <= b);
}

/** Characters the document's font cannot show (sorted, distinct). */
export function uncoveredChars(text: string, font: FontId): string[] {
  const set = new Set<string>();
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (!IGNORED_CODEPOINTS.has(cp) && !isCovered(cp, font)) set.add(ch);
  }
  return [...set].sort((a, b) => (a.codePointAt(0) as number) - (b.codePointAt(0) as number));
}

function hostOk(host: string): boolean {
  const labels = host.split('.');
  if (labels.length < 2) return false;
  const labelRe = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u;
  if (!labels.every((l) => labelRe.test(l))) return false;
  return /^\p{L}{2,}$/u.test(labels[labels.length - 1]);
}

/** D40: optional http(s)://, host of ≥ 2 labels with a letter TLD, optional port and path, no spaces. */
export function isValidUrl(value: string): boolean {
  let u = value.trim();
  if (u === '' || /\s/.test(u)) return false;
  u = u.replace(/^https?:\/\//i, '');
  const cut = u.search(/[/?#]/);
  const hostPort = cut === -1 ? u : u.slice(0, cut);
  const colon = hostPort.indexOf(':');
  if (colon !== -1 && !/^[0-9]{1,5}$/.test(hostPort.slice(colon + 1))) return false;
  return hostOk(colon === -1 ? hostPort : hostPort.slice(0, colon));
}

export function isValidEmail(value: string): boolean {
  const e = value.trim();
  if (/\s/.test(e)) return false;
  const parts = e.split('@');
  return parts.length === 2 && parts[0].length > 0 && hostOk(parts[1]);
}

/** First word of a bullet: the first run of letters (with inner hyphens), lower case. */
export function firstWord(text: string): string {
  const m = /\p{L}+(?:-\p{L}+)*/u.exec(text);
  return m ? m[0].toLowerCase() : '';
}

const startsWithActionWord = (text: string) => ACTION_WORD_FORMS.has(firstWord(text));

/** ≥ 3 consecutive white-space-separated single letters ("S K I L L S"). */
export function hasSpacedLetters(text: string): boolean {
  let run = 0;
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    run = codeLength(tok) === 1 && LETTER.test(tok) ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}

function compareDates(a: PartialDate, b: PartialDate): number {
  if (a.month === null || b.month === null) return a.year - b.year;
  return a.year - b.year || a.month - b.month;
}

const dupKey = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean).join(' ').replace(/(?:\s*\.)+$/, '');

type TextField = { target: FixTarget; text: string };

/** Every user text the document prints (C7, C13). */
export function documentTexts(model: RenderModel): TextField[] {
  const p = model.person;
  const out: TextField[] = [];
  for (const field of ['fullName', 'headline', 'email', 'phone', 'city', 'region', 'nationality'] as const) {
    const text = p[field];
    if (text) out.push({ target: { kind: 'profile', field }, text });
  }
  if (model.summary) out.push({ target: { kind: 'profile', field: 'summary' }, text: model.summary });
  p.links.forEach((l, index) => out.push({ target: { kind: 'link', index }, text: l.url }));
  for (const s of model.sections) {
    if (s.title !== null) out.push({ target: { kind: 'section', sectionId: s.id }, text: s.title });
    for (const e of s.entries) {
      for (const field of ['title', 'organization', 'location', 'description', 'url'] as const)
        if (e[field]) out.push({ target: { kind: 'entry', entryId: e.id, field }, text: e[field] });
      for (const key of Object.keys(e.extra).sort())
        if (e.extra[key]) out.push({ target: { kind: 'entry', entryId: e.id, field: `extra.${key}` }, text: e.extra[key] });
      for (const b of e.bullets) if (b.text) out.push({ target: { kind: 'bullet', entryId: e.id, bulletId: b.id }, text: b.text });
    }
  }
  return out;
}

// ---- the checks ---------------------------------------------------------------------------------------------------

type Ctx = CheckContext;
type Run = (model: RenderModel, ctx: Ctx) => Finding[];

const f = (code: string, severity: Severity, target: FixTarget, messageKey: TranslationKey, params: Finding['params'] = {}): Finding => ({
  code,
  severity,
  target,
  messageKey,
  params,
});

const RUNS: Record<CheckId, Run> = {
  C1: ({ person }) => [
    ...(blank(person.fullName) ? [f('name', 'attention', { kind: 'profile', field: 'fullName' }, 'check.C1.name')] : []),
    ...(blank(person.email) ? [f('email', 'attention', { kind: 'profile', field: 'email' }, 'check.C1.email')] : []),
    ...(blank(person.phone) ? [f('phone', 'info', { kind: 'profile', field: 'phone' }, 'check.C1.phone')] : []),
  ],
  C2: () => [],
  C3: () => [],
  C4: ({ person }) => (person.photoFile ? [f('photo', 'warning', { kind: 'design' }, 'check.C4.photo')] : []),
  C5: ({ sections }) =>
    sections
      .filter((s) => s.title !== null && !STANDARD_HEADINGS.has(s.title.split(/\s+/).filter(Boolean).join(' ').toLowerCase()))
      .map((s) => f('customTitle', 'info', { kind: 'section', sectionId: s.id }, 'check.C5.customTitle', { title: s.title as string })),
  C6: ({ person, sections }) => {
    const targets: { target: FixTarget; text: string }[] = [{ target: { kind: 'profile', field: 'headline' }, text: person.headline }];
    for (const s of sections)
      if (s.kind === 'experience' || s.kind === 'volunteer')
        for (const e of s.entries) targets.push({ target: { kind: 'entry', entryId: e.id, field: 'title' }, text: e.title });
    const out: Finding[] = [];
    for (const { target, text } of targets) {
      const found = ABBREVIATIONS.filter(([abbr]) => {
        const re = abbr === 'VP' ? /(?<![\p{L}\p{N}])VP(?![\p{L}\p{N}])/u : new RegExp(`(?<![\\p{L}.])${abbr.replace('.', '\\.')}`, 'u');
        return re.test(text);
      });
      for (const [abbr, long] of [...found].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
        out.push(f('abbreviation', 'info', target, 'check.C6.abbreviation', { abbr, long }));
    }
    return out;
  },
  C7: (model) =>
    documentTexts(model)
      .filter((t) => hasSpacedLetters(t.text))
      .map((t) => f('spacedLetters', 'attention', t.target, 'check.C7.spacedLetters')),
  C8: ({ sections }, { today }) => {
    const out: Finding[] = [];
    const now: PartialDate = { year: today.year, month: today.month };
    for (const s of sections) {
      const precisions = new Set<number>();
      for (const e of s.entries) {
        const target: FixTarget = { kind: 'entry', entryId: e.id, field: null };
        const start = parsePartialDate(e.startDate);
        const end = parsePartialDate(e.endDate);
        for (const d of [start, end]) if (d) precisions.add(d.month === null ? 4 : 7);
        if (s.kind === 'experience' && !start) out.push(f('noStart', 'attention', target, 'check.C8.noStart'));
        if (start && end && compareDates(end, start) < 0) out.push(f('endBeforeStart', 'attention', target, 'check.C8.endBeforeStart'));
        if (start && (start.month === null ? start.year > now.year : compareDates(start, now) > 0))
          out.push(f('futureStart', 'info', target, 'check.C8.futureStart'));
      }
      if (precisions.size > 1) out.push(f('mixedPrecision', 'info', { kind: 'section', sectionId: s.id }, 'check.C8.mixedPrecision'));
    }
    return out;
  },
  C9: ({ sections, droppedSections }) => {
    const out: Finding[] = droppedSections.map((d) =>
      f('emptySection', 'attention', { kind: 'section', sectionId: d.id }, 'check.C9.emptySection')
    );
    for (const s of sections)
      for (const e of s.entries) {
        const hasContent =
          !blank(e.title) ||
          !blank(e.organization) ||
          !blank(e.description) ||
          Object.values(e.extra).some((v) => !blank(v)) ||
          e.bullets.some((b) => !blank(b.text));
        if (!hasContent) out.push(f('emptyEntry', 'attention', { kind: 'entry', entryId: e.id, field: null }, 'check.C9.emptyEntry'));
        for (const b of e.bullets)
          if (blank(b.text)) out.push(f('emptyBullet', 'attention', { kind: 'bullet', entryId: e.id, bulletId: b.id }, 'check.C9.emptyBullet'));
      }
    return out;
  },
  C10: ({ sections }) => {
    const out: Finding[] = [];
    const seen = new Set<string>();
    for (const s of sections) {
      if (!BULLET_SECTIONS.has(s.kind)) continue;
      for (const e of s.entries)
        for (const b of e.bullets) {
          if (blank(b.text)) continue;
          const text = b.text.trim();
          const target: FixTarget = { kind: 'bullet', entryId: e.id, bulletId: b.id };
          const length = codeLength(text);
          if (length > MAX_BULLET_LENGTH) out.push(f('long', 'info', target, 'check.C10.long', { length }));
          if (FIRST_PERSON.has(firstWord(text))) out.push(f('firstPerson', 'info', target, 'check.C10.firstPerson'));
          if (!/\p{Nd}/u.test(text)) out.push(f('noNumber', 'info', target, 'check.C10.noNumber'));
          if (!startsWithActionWord(text)) out.push(f('noVerb', 'info', target, 'check.C10.noVerb'));
          const key = dupKey(text);
          if (seen.has(key)) out.push(f('duplicate', 'info', target, 'check.C10.duplicate'));
          seen.add(key);
        }
    }
    return out;
  },
  C11: (_m, { lastExport }) =>
    lastExport && lastExport.bytes > MAX_FILE_BYTES
      ? [f('fileSize', 'attention', { kind: 'export' }, 'check.C11.fileSize', { size: (lastExport.bytes / 1_000_000).toFixed(1) })]
      : [],
  C12: (_m, { lastExport }) =>
    lastExport && lastExport.pages > MAX_PAGES ? [f('pages', 'info', { kind: 'export' }, 'check.C12.pages', { pages: lastExport.pages })] : [],
  C13: (model) =>
    documentTexts(model).flatMap((t) => {
      const chars = uncoveredChars(t.text, effectiveFont(model.style, model.template));
      return chars.length ? [f('glyphs', 'attention', t.target, 'check.C13.glyphs', { chars: chars.join(' ') })] : [];
    }),
  C14: ({ person, sections }) => {
    const out: Finding[] = [];
    if (!blank(person.email) && !isValidEmail(person.email))
      out.push(f('email', 'attention', { kind: 'profile', field: 'email' }, 'check.C14.email', { value: person.email.trim() }));
    person.links.forEach((l, index) => {
      if (!blank(l.url) && !isValidUrl(l.url)) out.push(f('url', 'attention', { kind: 'link', index }, 'check.C14.url', { value: l.url.trim() }));
    });
    for (const s of sections)
      for (const e of s.entries)
        if (!blank(e.url) && !isValidUrl(e.url))
          out.push(f('url', 'attention', { kind: 'entry', entryId: e.id, field: 'url' }, 'check.C14.url', { value: e.url.trim() }));
    return out;
  },
  C15: (_m, { readback }) => {
    if (!readback || readback.unavailable || readback.pass) return [];
    const counts: Finding['params'] =
      readback.words && readback.lines
        ? {
            found: readback.words.found,
            expected: readback.words.expected,
            inOrder: readback.lines.inOrder,
            lines: readback.lines.total,
            reader: readback.reader ?? '',
          }
        : {};
    return [f('readbackFailed', 'attention', { kind: 'export' }, 'check.C15.readbackFailed', counts)];
  },
};

const RANK: Record<Severity, number> = { info: 1, warning: 2, attention: 3 };

function noteFor(id: CheckId, ctx: Ctx, findings: Finding[]): { status: CheckStatus; note: TranslationKey | null } {
  if (id === 'C11' || id === 'C12') {
    if (!ctx.lastExport) return { status: 'notChecked', note: 'check.notChecked' };
  }
  if (id === 'C15') {
    if (!ctx.readback) return { status: 'notChecked', note: 'check.notChecked' };
    if (ctx.readback.unavailable) return { status: 'notChecked', note: 'check.C15.unavailable' };
  }
  if (findings.length) {
    const worst = findings.reduce((w, x) => (RANK[x.severity] > RANK[w] ? x.severity : w), findings[0].severity);
    return { status: worst, note: null };
  }
  const okNotes: Partial<Record<CheckId, TranslationKey>> = { C2: 'check.C2.ok', C3: 'check.C3.ok', C15: 'check.C15.pass' };
  return { status: 'ok', note: okNotes[id] ?? null };
}

/** Runs C1–C15 on the visible document (RenderModel from resolve.ts). */
export function runChecks(model: RenderModel, ctx: CheckContext): CheckResult[] {
  return CHECK_IDS.map((id) => {
    const exportBased = id === 'C11' || id === 'C12' || id === 'C15';
    const findings = exportBased && ctx.stale ? [] : RUNS[id](model, ctx);
    const { status, note } = exportBased && ctx.stale && (ctx.lastExport || ctx.readback) ? { status: 'notChecked' as const, note: 'check.stale' as const } : noteFor(id, ctx, findings);
    const source = SOURCES[id];
    return {
      id,
      titleKey: `check.${id}.title` as TranslationKey,
      sourceKey: `check.source.${source}` as TranslationKey,
      sourceUrls: URLS[source],
      status,
      guaranteed: id === 'C2' || id === 'C3',
      noteKey: note,
      findings,
    };
  });
}

/** D19: the only reason export is refused. */
export function exportBlocked(model: RenderModel): boolean {
  return blank(model.person.fullName);
}

export function checkCounts(results: readonly CheckResult[]): Record<CheckStatus, number> {
  const counts: Record<CheckStatus, number> = { ok: 0, notChecked: 0, attention: 0, info: 0, warning: 0 };
  for (const r of results) counts[r.status]++;
  return counts;
}
