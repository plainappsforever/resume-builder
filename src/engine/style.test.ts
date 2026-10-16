import { parseStyle } from './style';

describe('version style JSON', () => {
  it('defaults by document language', () => {
    expect(parseStyle('{}', 'en')).toEqual({
      font: null,
      accent: null,
      sizeStep: 0,
      marginStep: 0,
      spacingStep: 0,
      headingCase: null,
      photo: false,
      paper: 'a4',
      dateStyle: 'Mon YYYY',
    });
    expect(parseStyle(null, 'de').dateStyle).toBe('MM/YYYY');
  });
  it('keeps valid choices, clamps steps, ignores junk', () => {
    expect(
      parseStyle(
        JSON.stringify({ font: 'lato', accent: '#1f4e79', sizeStep: 5, marginStep: -9, spacingStep: 1.5, headingCase: 'upper', photo: true, paper: 'letter', dateStyle: 'YYYY', extra: 1 }),
        'en'
      )
    ).toEqual({ font: 'lato', accent: '#1F4E79', sizeStep: 2, marginStep: -2, spacingStep: 0, headingCase: 'upper', photo: true, paper: 'letter', dateStyle: 'YYYY' });
    expect(parseStyle('{"font":"comic","accent":"red","photo":"yes","paper":"a3"}', 'de')).toMatchObject({
      font: null,
      accent: null,
      photo: false,
      paper: 'a4',
    });
    expect(parseStyle('not json', 'en').paper).toBe('a4');
    expect(parseStyle('[1,2]', 'en').sizeStep).toBe(0);
  });
});
