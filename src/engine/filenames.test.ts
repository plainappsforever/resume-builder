import { documentFileName, fileNamePart, MAX_FILE_NAME } from './filenames';

describe('file names (SPEC §5.9)', () => {
  it('resume EN/DE, with and without company', () => {
    expect(documentFileName({ fullName: 'Jordan Lee', company: 'Northfield Logistics', language: 'en', kind: 'resume', ext: 'pdf' })).toBe(
      'Jordan-Lee-Resume-Northfield-Logistics.pdf'
    );
    expect(documentFileName({ fullName: 'Jordan Lee', language: 'en', kind: 'resume', ext: 'pdf' })).toBe('Jordan-Lee-Resume.pdf');
    expect(documentFileName({ fullName: 'Lena Müller-Özdemir', company: 'Klinikum Am Südpark', language: 'de', kind: 'resume', ext: 'pdf' })).toBe(
      'Lena-Mueller-Oezdemir-Lebenslauf-Klinikum-Am-Suedpark.pdf'
    );
  });
  it('cover letter and plain text', () => {
    expect(documentFileName({ fullName: 'Jordan Lee', company: 'ACME', language: 'en', kind: 'cover', ext: 'pdf' })).toBe(
      'Jordan-Lee-Cover-Letter-ACME.pdf'
    );
    expect(documentFileName({ fullName: 'Lena Weiß', company: '', language: 'de', kind: 'cover', ext: 'txt' })).toBe('Lena-Weiss-Anschreiben.txt');
  });
  it('ASCII folding', () => {
    expect(fileNamePart('José Ångström-Søren')).toBe('Jose-Angstroem-Soren'); // German transliteration for every ä/ö/ü
    expect(fileNamePart('  Łukasz  Żółć  ')).toBe('Lukasz-Zolc');
    expect(fileNamePart('Smith & Sons, Inc.')).toBe('Smith-and-Sons-Inc');
    expect(fileNamePart('Müller & Söhne', 'de')).toBe('Mueller-und-Soehne'); // v1.1, REVIEW_V1 #21
    expect(fileNamePart('Ｗide Ⅻ')).toBe('Wide-XII'); // NFKC first (review finding 15)
    expect(fileNamePart('李华')).toBe('');
    expect(fileNamePart('O’Brien / Co. #1')).toBe('O-Brien-Co-1');
  });
  it('never longer than 80 characters: company shortened first, then the name', () => {
    const long = documentFileName({ fullName: 'Jordan Lee', company: 'A'.repeat(200), language: 'en', kind: 'resume', ext: 'pdf' });
    expect(long.length).toBeLessThanOrEqual(MAX_FILE_NAME);
    expect(long.startsWith('Jordan-Lee-Resume-AAAA')).toBe(true);
    expect(long.endsWith('A.pdf')).toBe(true);
    const longName = documentFileName({ fullName: 'B'.repeat(120), company: 'X', language: 'de', kind: 'cover', ext: 'pdf' });
    expect(longName.length).toBeLessThanOrEqual(MAX_FILE_NAME);
    expect(longName.endsWith('-Anschreiben.pdf')).toBe(true);
    // A cut that lands on a dash never leaves "--" or a trailing dash.
    const dashy = documentFileName({ fullName: 'Jordan Lee', company: 'Alpha Beta '.repeat(20), language: 'en', kind: 'resume', ext: 'pdf' });
    expect(dashy).not.toMatch(/--|-\.pdf$/);
    expect(dashy.length).toBeLessThanOrEqual(MAX_FILE_NAME);
  });
  it('without a usable name the document word stands alone', () => {
    expect(documentFileName({ fullName: '', language: 'en', kind: 'resume', ext: 'pdf' })).toBe('Resume.pdf');
    expect(documentFileName({ fullName: '王', company: 'Ä', language: 'de', kind: 'resume', ext: 'pdf' })).toBe('Lebenslauf-Ae.pdf');
  });
});
