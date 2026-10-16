// Fit to one page (SPEC §5.8). PURE: the ordered plan of style changes and the loop over an injected renderer, so the
// P5 glue only supplies "render this style → page count (+ overflow)" (printToFileAsync, page count only).
// Order: spacing → compact; margins → narrow; font size −0.5 pt per step down to 9.5 pt; then stop. At most 6 renders.
// The version keeps the smallest tried settings only when the user taps "Keep" (the caller decides; nothing is saved here).
import { STEP_MIN, type VersionStyle } from './style';

export const FIT_MIN_SIZE_PT = 9.5;
export const FIT_MAX_RENDERS = 6;
/** Must equal render/model.ts SIZE_STEP_PT (a Jest test pins it). */
export const FIT_SIZE_STEP_PT = 0.5;

export type FitStepKind = 'spacing' | 'margins' | 'size';
export type FitStep = { kind: FitStepKind; style: VersionStyle; sizePt: number };

/**
 * The styles to try, in order, each building on the previous one: spacing at its most compact step, margins at their
 * narrowest, then the font size down by 0.5 pt per step while it stays ≥ 9.5 pt and the step range allows it.
 * Steps that change nothing (already compact / narrow) are skipped. At most FIT_MAX_RENDERS steps.
 * `baseSizePt` = the template's base size (render/html/*.ts); size = base + 0.5 pt × sizeStep.
 */
export function fitPlan(start: VersionStyle, baseSizePt: number): FitStep[] {
  const steps: FitStep[] = [];
  const size = (s: VersionStyle) => baseSizePt + FIT_SIZE_STEP_PT * s.sizeStep;
  let current = start;
  const push = (kind: FitStepKind, style: VersionStyle) => {
    current = style;
    steps.push({ kind, style, sizePt: size(style) });
  };
  if (current.spacingStep > STEP_MIN) push('spacing', { ...current, spacingStep: STEP_MIN });
  if (current.marginStep > STEP_MIN) push('margins', { ...current, marginStep: STEP_MIN });
  while (current.sizeStep > STEP_MIN && size({ ...current, sizeStep: current.sizeStep - 1 }) >= FIT_MIN_SIZE_PT - 1e-9) {
    push('size', { ...current, sizeStep: current.sizeStep - 1 });
  }
  return steps.slice(0, FIT_MAX_RENDERS);
}

/** "About N lines too long" from the rendered content height (pt) beyond one page's content area (SPEC §5.8). */
export function linesTooLong(overflowPt: number, sizePt: number, lineHeight: number): number {
  if (!(overflowPt > 0)) return 0;
  return Math.max(1, Math.ceil(overflowPt / (sizePt * lineHeight)));
}

export type FitRender = { pages: number; overflowPt: number };
export type FitResult =
  | { fitted: true; style: VersionStyle; renders: number; tried: FitStepKind[] }
  | { fitted: false; style: VersionStyle; renders: number; tried: FitStepKind[]; pages: number; overflowPt: number };

/**
 * Runs the plan until a render has 1 page or the steps are exhausted. `style` = the first one-page style, or the
 * smallest tried (the user may "Keep" it). Never more than FIT_MAX_RENDERS renders. A start that already fits needs
 * no render (the preview's page count tells: `startPages`).
 */
export async function runFit(
  start: VersionStyle,
  baseSizePt: number,
  startPages: number,
  render: (style: VersionStyle) => Promise<FitRender>
): Promise<FitResult> {
  if (startPages <= 1) return { fitted: true, style: start, renders: 0, tried: [] };
  const tried: FitStepKind[] = [];
  let last: FitRender = { pages: startPages, overflowPt: 0 };
  let style = start;
  for (const step of fitPlan(start, baseSizePt)) {
    last = await render(step.style);
    tried.push(step.kind);
    style = step.style;
    if (last.pages <= 1) return { fitted: true, style, renders: tried.length, tried };
  }
  return { fitted: false, style, renders: tried.length, tried, pages: last.pages, overflowPt: last.overflowPt };
}
