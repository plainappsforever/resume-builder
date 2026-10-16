import { SIZE_STEP_PT } from '@/render/model';

import { FIT_MAX_RENDERS, FIT_MIN_SIZE_PT, FIT_SIZE_STEP_PT, fitPlan, linesTooLong, runFit } from './fit';
import { parseStyle, type VersionStyle } from './style';

const base = (patch: Partial<VersionStyle> = {}): VersionStyle => ({ ...parseStyle('{}', 'en'), ...patch });

describe('fit to one page (SPEC §5.8; P3.5 review finding 8)', () => {
  it('order: spacing → margins → size −0.5 pt per step, never below 9.5 pt', () => {
    const plan = fitPlan(base(), 10.5); // Lebenslauf/Plain base 10.5 pt
    expect(plan.map((s) => s.kind)).toEqual(['spacing', 'margins', 'size', 'size']);
    expect(plan.map((s) => s.sizePt)).toEqual([10.5, 10.5, 10, 9.5]);
    expect(plan[plan.length - 1].style).toMatchObject({ spacingStep: -2, marginStep: -2, sizeStep: -2 });
    expect(FIT_SIZE_STEP_PT).toBe(SIZE_STEP_PT);
  });
  it('the 9.5 pt floor and the step range both stop the size steps; done steps are skipped', () => {
    expect(fitPlan(base(), 9.5).map((s) => s.kind)).toEqual(['spacing', 'margins']); // Compact
    expect(fitPlan(base(), 10).map((s) => s.sizePt)).toEqual([10, 10, 9.5]);
    expect(fitPlan(base({ sizeStep: 2 }), 11).map((s) => s.sizePt)).toEqual([12, 12, 11.5, 11, 10.5, 10]); // 6 renders max
    expect(fitPlan(base({ spacingStep: -2, marginStep: -2, sizeStep: -2 }), 10)).toEqual([]);
    for (const b of [9.5, 10, 10.5, 11])
      for (const s of fitPlan(base({ sizeStep: 2 }), b)) expect(s.sizePt).toBeGreaterThanOrEqual(FIT_MIN_SIZE_PT);
    expect(fitPlan(base({ sizeStep: 2, spacingStep: 2, marginStep: 2 }), 11).length).toBe(FIT_MAX_RENDERS);
  });
  it('stops at the first one-page render', async () => {
    const pages = [2, 1, 1];
    const rendered: VersionStyle[] = [];
    const r = await runFit(base(), 10.5, 2, async (s) => (rendered.push(s), { pages: pages.shift()!, overflowPt: 0 }));
    expect(r).toMatchObject({ fitted: true, renders: 2, tried: ['spacing', 'margins'], style: { spacingStep: -2, marginStep: -2, sizeStep: 0 } });
    expect(rendered).toHaveLength(2);
  });
  it('still 2 pages: keeps the smallest tried settings and says about how many lines are too long', async () => {
    const r = await runFit(base({ sizeStep: 2 }), 11, 2, async () => ({ pages: 2, overflowPt: 40 }));
    expect(r).toMatchObject({ fitted: false, renders: FIT_MAX_RENDERS, pages: 2, overflowPt: 40 });
    expect(r.style.sizeStep).toBe(-2);
    expect(linesTooLong(40, 10, 1.3)).toBe(4);
    expect(linesTooLong(1, 10, 1.3)).toBe(1);
    expect(linesTooLong(0, 10, 1.3)).toBe(0);
  });
  it('a document that already fits needs no render', async () => {
    const render = jest.fn();
    expect(await runFit(base(), 10, 1, render)).toMatchObject({ fitted: true, renders: 0 });
    expect(render).not.toHaveBeenCalled();
  });
});
