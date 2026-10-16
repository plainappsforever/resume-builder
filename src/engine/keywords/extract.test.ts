/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import expected from '../__fixtures__/job-ads/expected.json';
import reviewExpected from '../__fixtures__/job-ads-review/expected.json';
import { compoundHead, countInAd, employerTokens, extractKeywords, MAX_AD_LENGTH, SHOWN_KEYWORDS } from './extract';
import { autoTermsToStore, buildKeywordList } from './list';
import { STOP_WORDS } from './stopwords';

const ADS = join(__dirname, '..', '__fixtures__', 'job-ads');
const fixtures = Object.entries(expected).filter(([k]) => !k.startsWith('_')) as [string, string[]][];
const ad = (name: string) => readFileSync(join(ADS, `${name}.txt`), 'utf8');
const terms = (text: string) => extractKeywords(text).keywords.map((k) => k.term);

/**
 * A4: ≥ 90 % of each fixture's must-have phrases in the top 25. Measured exceptions are listed with their exact
 * count so any change shows up (L11 row in docs/V1_LOG.md P2): de-verwaltungsassistenz has 30 skill phrases; its two
 * misses (Datenpflege, Dokumentenmanagement) are places 26–27, under "Show all".
 */
const BELOW_TARGET: Record<string, number> = { 'de-verwaltungsassistenz': 10 };

describe('A4: must-have recall on the 12 job-ad fixtures (6 EN, 6 DE)', () => {
  it('has 12 fixtures, 6 per language, each with ≥ 10 must-haves', () => {
    expect(fixtures).toHaveLength(12);
    expect(fixtures.filter(([n]) => n.startsWith('en-'))).toHaveLength(6);
    for (const [, must] of fixtures) expect(must.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)('%s', (name, must) => {
    const top = terms(ad(name)).slice(0, SHOWN_KEYWORDS);
    const hits = must.filter((m) => top.includes(m));
    if (name in BELOW_TARGET) expect(hits.length).toBe(BELOW_TARGET[name]);
    else expect(hits.length / must.length).toBeGreaterThanOrEqual(0.9);
  });

  it('no keyword is a stop word, and no phrase starts or ends with one unless it is a known skill', () => {
    for (const [name] of fixtures) {
      for (const k of extractKeywords(ad(name)).keywords) {
        const parts = k.term.split(' ');
        if (parts.length === 1) expect([name, k.term, STOP_WORDS.has(k.term) && k.term !== 'it']).toEqual([name, k.term, false]);
        else if (!k.inDictionary) expect([name, k.term, STOP_WORDS.has(parts[0]) || STOP_WORDS.has(parts[parts.length - 1])]).toEqual([name, k.term, false]);
      }
    }
  });
});

describe('extraction rules (SPEC §5.3, D37–D43)', () => {
  it('requirement blocks start at a listed heading and end at the next short "…:" line', () => {
    const text = 'About us:\nWe use Kafka daily.\nRequirements:\n- Terraform\n- Kafka\nBenefits:\nGym and Kafka swag';
    const byTerm = new Map(extractKeywords(text).keywords.map((k) => [k.term, k]));
    expect(byTerm.get('terraform')?.inRequirements).toBe(true);
    expect(byTerm.get('kafka')).toMatchObject({ tf: 3, inRequirements: true, inDictionary: true, score: 3 * 1.5 * 3 });
    expect(byTerm.get('gym')?.inRequirements).toBe(false);
  });

  it('German headings ("Dein Profil", "Das bringst du mit") start a block', () => {
    const k = extractKeywords('Aufgaben:\nDATEV pflegen\nDas bringst du mit:\nDATEV und Excel').keywords;
    expect(k.find((x) => x.term === 'excel')?.inRequirements).toBe(true);
  });

  it('subsumption: a fragment with the same tf as a longer skill phrase is dropped (step 6)', () => {
    expect(terms('Project management matters.')).toContain('project management');
    expect(terms('Project management matters.')).not.toContain('project');
    // tf differs → the fragment stays
    expect(terms('Project management. Project plans.')).toContain('project');
  });

  it('D42: "X and Y" is not a phrase unless listed, so its parts survive', () => {
    const t = terms('Mathematik und Physik. Fächer Mathematik und Physik. Mathematik und Physik!');
    expect(t).toEqual(expect.arrayContaining(['mathematik', 'physik']));
    expect(t).not.toContain('mathematik und physik');
    expect(terms('Shipping and receiving daily')).toContain('shipping and receiving');
  });

  it('D43: a fragment that only occurs inside known skill phrases is dropped', () => {
    const t = terms('Statistical analysis. Data analysis. Regression analysis.');
    expect(t).toEqual(expect.arrayContaining(['statistical analysis', 'data analysis', 'regression analysis']));
    expect(t).not.toContain('analysis');
    // also at the end of a 3-word skill phrase ("social emotional learning")
    expect(terms('Machine learning. Social emotional learning.')).not.toContain('learning');
    expect(terms('Machine learning. Learning by doing.')).toContain('learning');
  });

  it('D37: IT/HR in capitals are keywords, "it" as a pronoun is not', () => {
    expect(terms('Experience in IT support. Make it work.')).toContain('it support');
    expect(terms('Our HR team. Make it work.')).toContain('hr');
    expect(terms('Make it work and keep it simple.')).not.toContain('it');
  });

  it('order: score, then first occurrence; snippet is the original line', () => {
    const { keywords } = extractKeywords('Intro line with Zendesk\nRequirements:\n• Salesforce and Zendesk');
    expect(keywords[0]).toMatchObject({ term: 'zendesk', tf: 2 });
    expect(keywords[0].snippet).toBe('Intro line with Zendesk');
    const long = `Requirements:\n${'word '.repeat(60)}Kubernetes ${'tail '.repeat(40)}`;
    const k8s = extractKeywords(long).keywords.find((k) => k.term === 'kubernetes');
    expect(k8s?.snippet.length).toBeLessThanOrEqual(122);
    expect(k8s?.snippet).toContain('Kubernetes');
  });

  it('cuts ads over 50,000 characters and says so', () => {
    const big = 'Python developer. '.repeat(4000);
    const r = extractKeywords(big);
    expect(big.length).toBeGreaterThan(MAX_AD_LENGTH);
    expect(r.truncated).toBe(true);
    expect(r.keywords.find((k) => k.term === 'python')?.tf).toBe(Math.ceil(MAX_AD_LENGTH / 'Python developer. '.length));
    expect(extractKeywords('').keywords).toEqual([]);
  });

  it('detects the ad language for the mismatch note', () => {
    expect(extractKeywords(ad('de-lehrer')).language).toBe('de');
    expect(extractKeywords(ad('en-retail')).language).toBe('en');
    expect(extractKeywords('SQL Python').language).toBeNull();
  });

  it('is deterministic', () => {
    expect(extractKeywords(ad('en-marketing'))).toEqual(extractKeywords(ad('en-marketing')));
  });

  it('countInAd counts any exact occurrence (tf of a user-added phrase)', () => {
    expect(countInAd('Data. More data, and DATA again', 'data')).toBe(3);
    expect(countInAd('nothing here', 'kotlin')).toBe(0);
  });
});

describe('keyword list with the user’s choices (D38)', () => {
  const text = ad('en-software-developer');
  const extraction = extractKeywords(text);
  it('pinned first, then added, then the ad’s order; ignored separate; 25 shown', () => {
    const list = buildKeywordList(text, extraction, [
      { term: 'scrum', source: 'auto', state: 'pinned' },
      { term: 'typescript', source: 'auto', state: 'ignored' },
      { term: 'Rust', source: 'added', state: 'normal' },
    ]);
    expect(list.shown[0]).toMatchObject({ term: 'scrum', state: 'pinned' });
    expect(list.shown[1]).toMatchObject({ term: 'rust', source: 'added', tf: 0, extracted: null });
    expect(list.shown.map((i) => i.term)).not.toContain('typescript');
    expect(list.ignored.map((i) => i.term)).toEqual(['typescript']);
    expect(list.shown).toHaveLength(SHOWN_KEYWORDS);
    expect(list.shown.length + list.more.length + list.ignored.length).toBe(extraction.keywords.length + 1);
  });
  it('stores the 25 shown automatic terms', () => {
    expect(autoTermsToStore(extraction)).toEqual(extraction.keywords.slice(0, 25).map((k) => k.term));
  });
});

describe('D55: the skill-list head of a hyphen compound is a keyword (review finding 3)', () => {
  it('Java-Entwicklung → java, C++-Entwicklung → c++, SQL-Datenbanken → sql; the compound stays too', () => {
    const got = terms('Anforderungen:\n- Erfahrung in der Java-Entwicklung\n- SQL-Datenbanken und C++-Entwicklung');
    expect(got).toEqual(expect.arrayContaining(['java', 'sql', 'c++', 'java-entwicklung']));
    expect(compoundHead('it-support')).toBeNull(); // the whole compound is a skill
    expect(compoundHead('e-commerce')).toBeNull(); // protected
    expect(compoundHead('front-end')).toBeNull(); // no skill head
  });
});

describe('D56: no junk fragments from hyphen/slash compounds; German function words (review findings 10, 11)', () => {
  it('no self / hands / ex / mann / anderen / umgang', () => {
    const got = terms('Requirements:\n- Self-motivated, hands-on\n- Customs documents (ATLAS, EX-A)\n- Pflegefachfrau/-mann\n- Sicherer Umgang mit Medistar oder einer anderen Praxissoftware');
    for (const junk of ['self', 'hands', 'ex', 'mann', 'anderen', 'umgang', 'anderen praxissoftware']) expect(got).not.toContain(junk);
    expect(got).toEqual(expect.arrayContaining(['pflegefachfrau', 'medistar', 'praxissoftware']));
  });
});

describe('D57: blocks end at tasks/benefits/about headings with or without a colon (review finding 5)', () => {
  const kw = (text: string) => new Map(extractKeywords(text).keywords.map((k) => [k.term, k]));
  it('"Wir bieten" / "What we offer" / inline "Benefits:" end the requirements block; benefits weigh less', () => {
    const de = kw('Das bringst du mit:\n- Erfahrung mit Medistar\nWir bieten\nFaire Bezahlung nach Tarif, Fortbildungen');
    expect(de.get('medistar')?.inRequirements).toBe(true);
    for (const t of ['bezahlung', 'tarif', 'fortbildungen']) expect([t, de.get(t)?.inRequirements]).toEqual([t, false]);
    expect(de.get('tarif')?.score).toBe(0.5); // tf 1 × wPos 0.5 × wDict 1
    const en = kw('Requirements:\n- Excel and SQL\nWhat we offer\n30 days of holiday at the harbour');
    expect(en.get('holiday')?.inRequirements).toBe(false);
    const inline = kw('Must have:\n- React\nBenefits: remote-first, learning budget, gym');
    expect(inline.get('gym')?.inRequirements).toBe(false);
    expect(inline.get('react')?.inRequirements).toBe(true);
    const tasks = kw('Requirements:\n- SQL\nDeine Aufgaben\n- Tourenplanung');
    expect(tasks.get('tourenplanung')).toMatchObject({ inRequirements: false, score: 3 }); // skill × wPos 1
  });
  it('a phrase that is not a skill-list term needs tf ≥ 2', () => {
    const got = terms('Requirements:\n- Completed apprenticeship as freight forwarding agent\n- Excel pivot tables');
    expect(got).not.toEqual(expect.arrayContaining(['apprenticeship as freight']));
    expect(got.filter((t) => t.includes(' ') && t !== 'pivot tables' && t !== 'freight forwarding')).toEqual([]);
  });
});

/**
 * The reviewer's 4 job ads (P3.5, REVIEW_ENGINE.md finding 5) with must-have lists fixed before any engine run. Blind for
 * the P2 rules: 46/61 (75 %). After the general D55–D57 rules alone: 50/61 (82 %). After the D57 dictionary additions
 * (which include their missing tools, so NO LONGER BLIND, L27 rule 4): 60/61. A regression guard, not evidence of
 * accuracy on unseen ads — the next review needs new blind ads.
 */
describe('recall on the review ads (not blind any more)', () => {
  const REVIEW = join(__dirname, '..', '__fixtures__', 'job-ads-review');
  it('60 of 61 must-haves in the top 25', () => {
    let hits = 0;
    let total = 0;
    for (const [name, must] of Object.entries(reviewExpected) as [string, string[]][]) {
      const top = terms(readFileSync(join(REVIEW, `${name}.txt`), 'utf8')).slice(0, SHOWN_KEYWORDS);
      hits += must.filter((m) => top.includes(m)).length;
      total += must.length;
    }
    expect([hits, total]).toEqual([60, 61]);
  });
});

describe('D94: the employer is not a keyword', () => {
  it('capitalised words before a legal form and the target company are dropped; skills stay', () => {
    expect([...employerTokens(['Kranich Vogt GmbH & Co. KG sucht Verstärkung in Bremen.'])].sort()).toEqual(['kranich', 'vogt']);
    expect([...employerTokens(['SAP SE is hiring', 'Acme Brightwell Ltd is growing'])].sort()).toEqual(['acme', 'brightwell']);
    // a skill-list word is never a name: the walk stops there ("Logistik" is a skill)
    expect([...employerTokens(['Kranich Logistik GmbH'])]).toEqual([]);
    expect([...employerTokens([], 'Northwind Freight')].sort()).toEqual(['northwind']); // "freight" is a skill-list word
    const terms = extractKeywords('Kranich Vogt GmbH\nRequirements:\n- SAP and Excel\n- Kranich Vogt experience', { company: 'Excel Corp' }).keywords.map((k) => k.term);
    expect(terms).toContain('sap');
    expect(terms).not.toContain('kranich');
    expect(terms).not.toContain('gmbh');
    expect(terms).toContain('excel'); // skill-list words stay even inside the target company's name
  });
  it('the intro is company text (0.75), the first line is the job title (neutral)', () => {
    const k = extractKeywords('Night Associate\nWe ship parcels from our Ohio hub.\nYour tasks:\n- Sorting parcels at night').keywords;
    const score = (t: string) => k.find((x) => x.term === t)?.score;
    expect(score('associate')).toBe(1); // job title line
    expect(score('ohio')).toBe(0.75); // intro
    expect(score('sorting')).toBe(1); // tasks
  });
});
