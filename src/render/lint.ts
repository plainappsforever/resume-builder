// Static template linter (SPEC §5.6, V1_PLAN rule 13). PURE. Every template × fixture must return no issues (Jest).
// Each rule exists because the WebKit proxy experiment (RESEARCH §2.2) showed the construct breaking the PDF's
// reading order or losing text, or because it is not needed and would only add risk.

export type LintRule =
  | 'table'
  | 'list-markers'
  | 'generated-content'
  | 'positioning'
  | 'letter-spacing'
  | 'grid'
  | 'flex-push'
  | 'side-by-side'
  | 'columns'
  | 'right-align'
  | 'float'
  | 'text-transform'
  | 'small-caps'
  | 'transform'
  | 'hyphenation'
  | 'page-margin-boxes'
  | 'header-footer'
  | 'script'
  | 'external-resource'
  | 'graphics'
  | 'keep-together'
  | 'ligatures';

export type LintIssue = { rule: LintRule; detail: string };

const FORBIDDEN: readonly [LintRule, RegExp][] = [
  ['table', /<table\b|display\s*:\s*(inline-)?table/i],
  ['list-markers', /<(ul|ol|li)\b|list-style(?!(-type)?\s*:\s*none)|::?marker/i],
  ['generated-content', /(^|[^-\w])content\s*:/i],
  // Offsets move text away from its place in the flow (also with position:relative) — P3.5 review finding 14.
  ['positioning', /position\s*:\s*(absolute|fixed|sticky|running)|(^|[^-\w])(top|left|right|bottom|inset(-[a-z-]+)?)\s*:/i],
  ['letter-spacing', /letter-spacing|word-spacing/i],
  ['grid', /display\s*:\s*(inline-)?grid|grid-template/i],
  ['flex-push', /justify-content\s*:\s*(space-between|space-around|space-evenly|flex-end|end|right)|margin-left\s*:\s*auto|flex-direction\s*:\s*row-reverse/i],
  // Flex rows, inline-block columns and `order` put boxes side by side or change their order (review finding 14).
  ['side-by-side', /display\s*:\s*(inline-)?flex|display\s*:\s*inline-block|(^|[^-\w])order\s*:/i],
  ['columns', /\bcolumns\s*:|column-count|column-width/i],
  ['right-align', /text-align\s*:\s*(right|end|justify)|direction\s*:\s*rtl|unicode-bidi\s*:\s*(bidi-override|isolate-override|plaintext)/i],
  ['text-transform', /text-transform/i],
  ['small-caps', /font-variant(-caps)?\s*:\s*[^;}]*small-caps/i],
  ['transform', /(^|[^-\w])(transform|rotate|writing-mode)\s*:/i],
  ['page-margin-boxes', /@(top|bottom|left|right)-[a-z-]+/i],
  ['header-footer', /<(header|footer)\b/i],
  ['script', /<script\b|\son[a-z]+\s*=/i],
  ['external-resource', /(src|href)\s*=\s*["']?\s*(https?:|\/\/|file:)|url\(\s*["']?\s*(https?:|\/\/|file:)|<link\b|@import/i],
  ['graphics', /<(svg|canvas|iframe|object|embed|video|audio)\b/i],
];

function styleOf(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
}

/** Rules of the style sheets as [selector, declarations] (the @font-face data URLs contain no braces). */
function cssRules(css: string): [string, string][] {
  return [...css.replace(/@page\s*\{[^}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

export function lintHtml(html: string): LintIssue[] {
  const issues: LintIssue[] = [];
  // Inspect markup (tags and their attributes) and CSS (comments removed), but neither the text between tags — the
  // user's escaped words ("Content: strategy", "(one = two)") are not CSS — nor the base64 font/photo payloads (they
  // could contain any letter sequence). P3.5 review finding 14.
  const scrubbed = html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/g, 'data:,');
  const css = styleOf(scrubbed).replace(/\/\*[\s\S]*?\*\//g, '');
  const markup = scrubbed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<style></style>').replace(/>[^<]*</g, '><');
  const subject = `${markup}\n${css}`;
  for (const [rule, re] of FORBIDDEN) {
    const m = re.exec(subject);
    if (m) issues.push({ rule, detail: subject.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') });
  }
  for (const [selector, body] of cssRules(css)) {
    if (/\bfloat\s*:/i.test(body) && selector !== '.photo' && !/float\s*:\s*none/i.test(body)) {
      issues.push({ rule: 'float', detail: `${selector}{${body}}` });
    }
  }
  if (!/hyphens\s*:\s*none/i.test(css)) issues.push({ rule: 'hyphenation', detail: 'no hyphens:none' });
  if (!/font-variant-ligatures\s*:\s*none/i.test(css)) issues.push({ rule: 'ligatures', detail: 'no font-variant-ligatures:none (D45)' });
  if (!cssRules(css).some(([sel, body]) => /(^|,)\s*\.e\s*(,|$)/.test(sel) && /break-inside\s*:\s*avoid/i.test(body))) {
    issues.push({ rule: 'keep-together', detail: 'entry blocks (.e) lack break-inside:avoid' });
  }
  return issues;
}
