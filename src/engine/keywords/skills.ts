// Bundled skills/tools list (SPEC §5.3 step 5, D23) and acronym pairs (§5.4). Data in skills.json (written in-repo,
// also read by the Python oracle); here normalised exactly like job-ad text.
import data from './skills.json';
import { normalizeTerm } from './tokenize';

const LIST_KEYS = Object.keys(data).filter((k) => !['_comment', 'protected', 'acronyms'].includes(k)) as (keyof typeof data)[];

export const SKILLS: ReadonlySet<string> = new Set(
  LIST_KEYS.flatMap((k) => data[k] as string[])
    .map(normalizeTerm)
    .filter(Boolean)
);

/** [acronym, expansion] pairs, normalised. */
export const ACRONYM_PAIRS: readonly (readonly [string, string])[] = data.acronyms.map(
  ([a, e]) => [normalizeTerm(a), normalizeTerm(e)] as const
);

export const isSkill = (term: string) => SKILLS.has(term);

/** The other side(s) of an acronym pair ("kpi" → ["key performance indicator"]). */
export function acronymPartners(term: string): string[] {
  const out: string[] = [];
  for (const [a, e] of ACRONYM_PAIRS) {
    if (a === term) out.push(e);
    if (e === term) out.push(a);
  }
  return out;
}
