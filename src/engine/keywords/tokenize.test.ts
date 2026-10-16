import { normalizeText } from './normalize';
import { normalizeTerm, phraseTokens, textSegments } from './tokenize';

const segs = (text: string) => textSegments(text).map((s) => s.map((t) => t.low));

describe('normalisation (SPEC §5.3 step 1, D37)', () => {
  it('NFKC: ligatures become letters, decomposed umlauts compose', () => {
    expect(normalizeText('ﬁle ﬂow')).toBe('file flow');
    expect(normalizeText('Müller')).toBe('Müller');
  });
  it('typographic quotes and dashes become ASCII; soft hyphens vanish', () => {
    expect(normalizeText('„Gute“ ‘x’ a–b c—d e−f')).toBe('"Gute" \'x\' a-b c-d e-f');
    expect(normalizeText('Projekt­management')).toBe('Projektmanagement');
  });
});

describe('tokens (step 2, D37)', () => {
  it('protected terms stay whole: C++, C#, .NET, Node.js, CI/CD, S/4HANA, A/B, R&D', () => {
    expect(phraseTokens('C++, C# and .NET; Node.js with CI/CD on SAP S/4HANA, A/B tests, R&D')).toEqual([
      'c++', 'c#', 'and', '.net', 'node.js', 'with', 'ci/cd', 'on', 'sap', 's/4hana', 'a/b', 'tests', 'r&d',
    ]);
  });
  it('.net needs a boundary; vb.net and asp.net are one token', () => {
    expect(phraseTokens('vb.net asp.net .netcore')).toEqual(['vb.net', 'asp.net', 'netcore']);
  });
  it('other tokens split at "/"', () => {
    expect(phraseTokens('Python/Java/Go, Kauffrau/Kaufmann')).toEqual(['python', 'java', 'go', 'kauffrau', 'kaufmann']);
  });
  it('a trailing stop-word part of a hyphen compound is dropped (KNX-Kenntnisse → knx)', () => {
    expect(phraseTokens('KNX-Kenntnisse, MS-Office-Kenntnisse, SAP-Erfahrung, Projekt-Management')).toEqual([
      'knx', 'ms-office', 'sap', 'projekt-management',
    ]);
  });
  it('German case and umlauts: lower-cased, umlauts kept', () => {
    expect(phraseTokens('ÜBERWACHUNG Führerschein Straße')).toEqual(['überwachung', 'führerschein', 'straße']);
  });
  it('keeps the original case for the acronym rule', () => {
    const [seg] = textSegments('IT and it');
    expect(seg.map((t) => [t.low, t.caps])).toEqual([['it', true], ['and', false], ['it', false]]);
  });
  it('apostrophes stay inside words, trailing dots never end a token', () => {
    expect(phraseTokens("manager’s office... e.g. end.")).toEqual(["manager's", 'office', 'e.g', 'end']);
  });
});

describe('segments (step 3, D37)', () => {
  it('break at line ends, sentence ends, bullets, commas, brackets, pipes and quotes', () => {
    expect(segs('Requirements:\n• SQL and Excel (Power BI) | Tableau. Next; "Quoted"')).toEqual([
      ['requirements'], ['sql', 'and', 'excel'], ['power', 'bi'], ['tableau'], ['next'], ['quoted'],
    ]);
  });
  it('a dot or colon inside a token does not break (node.js, 3.5, 10:30)', () => {
    expect(segs('node.js 3.5 at 10:30')).toEqual([['node.js', '3.5', 'at', '10', '30']]);
  });
});

describe('normalizeTerm (stored keyword form)', () => {
  it('joins lower-case tokens with one space', () => {
    expect(normalizeTerm('  Projekt-Management ')).toBe('projekt-management');
    expect(normalizeTerm('Key   Performance\nIndicators')).toBe('key performance indicators');
    expect(normalizeTerm('C#')).toBe('c#');
  });
});
