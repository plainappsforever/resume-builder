import {
  comparePartialDates,
  defaultDateStyle,
  formatDate,
  formatDateRange,
  normalizeDateRange,
  parsePartialDate,
  sortNewestFirst,
  toStoredDate,
  validateDate,
  validateDateRange,
} from './dates';

const YEAR = 2026;

describe('parse and store', () => {
  it.each([
    ['2019', { year: 2019, month: null }],
    ['2019-03', { year: 2019, month: 3 }],
    ['2019-12', { year: 2019, month: 12 }],
  ])('%s', (value, parsed) => {
    expect(parsePartialDate(value)).toEqual(parsed);
    expect(toStoredDate(parsed)).toBe(value);
  });
  it.each(['', '19', '2019-3', '2019-00', '2019-13', '03/2019', '2019-03-01', ' 2019', null, undefined])('rejects %p', (value) => {
    expect(parsePartialDate(value)).toBeNull();
  });
});

describe('validation (SPEC §5.2)', () => {
  it('year range 1950 … current + 6', () => {
    expect(validateDate('1950', YEAR)).toBeNull();
    expect(validateDate('1949', YEAR)).toBe('date.error.year');
    expect(validateDate('2032-12', YEAR)).toBeNull();
    expect(validateDate('2033', YEAR)).toBe('date.error.year');
  });
  it('month 1–12 and the shape', () => {
    expect(validateDate('2020-00', YEAR)).toBe('date.error.month');
    expect(validateDate('2020-13', YEAR)).toBe('date.error.month');
    expect(validateDate('March 2020', YEAR)).toBe('date.error.format');
  });
  it('end ≥ start at the lower precision of the two', () => {
    const range = (startDate: string, endDate: string) => validateDateRange({ startDate, endDate, isCurrent: false }, YEAR);
    expect(range('2019-05', '2019-03')).toEqual({ end: 'date.error.endBeforeStart' });
    expect(range('2019-05', '2019-05')).toEqual({});
    expect(range('2019-05', '2019')).toEqual({}); // 2019 = the whole year
    expect(range('2019', '2019-01')).toEqual({});
    expect(range('2019', '2018-12')).toEqual({ end: 'date.error.endBeforeStart' });
    expect(range('2020-13', '2019')).toEqual({ start: 'date.error.month' });
    expect(comparePartialDates({ year: 2019, month: null }, { year: 2019, month: 7 })).toBe(0);
  });
  it('current ⇒ end cleared; blanks become NULL', () => {
    expect(normalizeDateRange({ startDate: ' 2020 ', endDate: '2021', isCurrent: true })).toEqual({
      startDate: '2020',
      endDate: null,
      isCurrent: true,
    });
    expect(normalizeDateRange({ startDate: '', endDate: '  ', isCurrent: false })).toEqual({
      startDate: null,
      endDate: null,
      isCurrent: false,
    });
    // An invalid end next to "current" does not matter: it is cleared.
    expect(validateDateRange({ startDate: '2020', endDate: 'nonsense', isCurrent: true }, YEAR)).toEqual({});
  });
});

describe('display (SPEC §5.2)', () => {
  it('defaults: DE MM/YYYY, EN Mon YYYY', () => {
    expect(defaultDateStyle('de')).toBe('MM/YYYY');
    expect(defaultDateStyle('en')).toBe('Mon YYYY');
  });
  it.each([
    ['2019-03', 'Mon YYYY', 'en', 'Mar 2019'],
    ['2019-03', 'Mon YYYY', 'de', 'März 2019'],
    ['2019-09', 'Mon YYYY', 'de', 'Sept. 2019'],
    ['2019-05', 'Mon YYYY', 'de', 'Mai 2019'],
    ['2019-03', 'MM/YYYY', 'en', '03/2019'],
    ['2019-11', 'MM/YYYY', 'de', '11/2019'],
    ['2019-03', 'YYYY', 'de', '2019'],
    ['2019', 'Mon YYYY', 'en', '2019'],
    ['2019', 'MM/YYYY', 'de', '2019'],
  ] as const)('%s %s %s → %s', (value, style, lang, text) => {
    expect(formatDate(value, style, lang)).toBe(text);
  });
  it('ranges: en dash, Present/heute, single dates, collapsed equal ends', () => {
    expect(formatDateRange({ startDate: '2021-03', endDate: null, isCurrent: true }, 'Mon YYYY', 'en')).toBe('Mar 2021 – Present');
    expect(formatDateRange({ startDate: '2021-03', endDate: null, isCurrent: true }, 'MM/YYYY', 'de')).toBe('03/2021 – heute');
    expect(formatDateRange({ startDate: '2017-06', endDate: '2021-02', isCurrent: false }, 'MM/YYYY', 'en')).toBe('06/2017 – 02/2021');
    expect(formatDateRange({ startDate: '2013', endDate: '2017', isCurrent: false }, 'Mon YYYY', 'en')).toBe('2013 – 2017');
    expect(formatDateRange({ startDate: '2022-05', endDate: null, isCurrent: false }, 'Mon YYYY', 'en')).toBe('May 2022');
    expect(formatDateRange({ startDate: null, endDate: '2022', isCurrent: false }, 'YYYY', 'en')).toBe('2022');
    expect(formatDateRange({ startDate: null, endDate: null, isCurrent: false }, 'YYYY', 'en')).toBe('');
    expect(formatDateRange({ startDate: '2019-02', endDate: '2019-09', isCurrent: false }, 'YYYY', 'de')).toBe('2019');
    expect(formatDateRange({ startDate: null, endDate: null, isCurrent: true }, 'YYYY', 'de')).toBe('heute');
  });
});

describe('sort newest first (helper, never automatic)', () => {
  it('current first, then by end, then by start; undated last; stable', () => {
    const items = [
      { id: 'old', startDate: '2010', endDate: '2012', isCurrent: false },
      { id: 'undated', startDate: null, endDate: null, isCurrent: false },
      { id: 'current', startDate: '2018-01', endDate: null, isCurrent: true },
      { id: 'mid', startDate: '2015-04', endDate: '2017-12', isCurrent: false },
      { id: 'mid-later-start', startDate: '2016-01', endDate: '2017-12', isCurrent: false },
      { id: 'start-only', startDate: '2019-06', endDate: null, isCurrent: false },
      { id: 'undated-2', startDate: null, endDate: null, isCurrent: false },
    ];
    expect(sortNewestFirst(items).map((i) => i.id)).toEqual([
      'current',
      'start-only',
      'mid-later-start',
      'mid',
      'old',
      'undated',
      'undated-2',
    ]);
    expect(items[0].id).toBe('old'); // input untouched
  });
});

describe('test environment', () => {
  it('Jest runs in German local time (test/global-setup.js)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Berlin');
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-60);
  });
});
