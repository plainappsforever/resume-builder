// Stop words (SPEC §5.3 step 4): EN + DE function words and job-ad boilerplate; all lists always apply (§10).
// The word lists are data in stopwords.json (also read by the Python oracle, scripts/keywords-checks-oracle.py).
import data from './stopwords.json';
import { normalizeText } from './normalize';

const norm = (w: string) => normalizeText(w).toLowerCase();

export const FUNCTION_WORDS_EN: ReadonlySet<string> = new Set(data.functionEn.map(norm));
export const FUNCTION_WORDS_DE: ReadonlySet<string> = new Set(data.functionDe.map(norm));

/** v1.1 (D94): company legal forms (GmbH, AG, Inc, Ltd …): stop words, and they mark the employer's name. */
export const LEGAL_FORMS: ReadonlySet<string> = new Set(data.legalForms.map(norm));

export const STOP_WORDS: ReadonlySet<string> = new Set(
  [...data.functionEn, ...data.functionDe, ...data.boilerplateEn, ...data.boilerplateDe, ...data.legalForms].map(norm)
);

export const isStopWord = (lower: string) => STOP_WORDS.has(lower);
