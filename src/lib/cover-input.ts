// Cover letter glue that needs no phone (F10, A15): the letter row + profile → what the renderer prints, the design it uses
// (its resume's template and style, or Modern with the document defaults), the ISO date of "today", and the example insert.
import type { CoverLetter } from '@/db/covers';
import { COVER_EXAMPLES, fillCoverPlaceholders, type CoverExample } from '@/engine/content/cover-examples';
import { parseStyle, type VersionStyle } from '@/engine/style';
import type { Lang, Profile, TemplateId, Version } from '@/engine/types';
import type { CoverInput } from '@/render/html/cover';

export function coverInput(cover: CoverLetter, sender: Pick<Profile, 'fullName' | 'email' | 'phone' | 'city' | 'region'>): CoverInput {
  return {
    language: cover.language,
    sender: { fullName: sender.fullName, email: sender.email, phone: sender.phone, city: sender.city, region: sender.region },
    recipientCompany: cover.recipientCompany,
    contactPerson: cover.contactPerson,
    address: cover.address,
    letterDate: cover.letterDate,
    subject: cover.subject,
    salutation: cover.salutation,
    body: cover.body,
    closing: cover.closing,
    signatureName: cover.signatureName,
  };
}

export type CoverDesign = { template: TemplateId; style: VersionStyle };

/** The linked resume's design; a letter without one (or whose resume was deleted) is set in Modern with the defaults. */
export function coverDesign(version: Pick<Version, 'template' | 'styleJson'> | null, lang: Lang, defaultPaper: 'a4' | 'letter'): CoverDesign {
  if (version) return { template: version.template, style: parseStyle(version.styleJson, lang) };
  return { template: 'modern', style: { ...parseStyle('{}', lang), paper: defaultPaper } };
}

/** Local date as `YYYY-MM-DD` (the letter's date when it has none of its own). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type CoverFill = { role: string; company: string; contact: string; name: string };

const NO_CONTACT_SALUTATION: Record<Lang, string> = { en: 'Dear Hiring Manager,', de: 'Sehr geehrte Damen und Herren,' };

/**
 * An example's text with the placeholders filled where the letter knows the value (an unknown one stays visible, so the
 * user sees what is missing) — except the salutation: without a contact person it becomes the neutral greeting.
 */
export function coverExampleFields(example: CoverExample, fill: CoverFill, lang: Lang) {
  const f = (text: string) => fillCoverPlaceholders(text, fill);
  return {
    subject: f(example.subject),
    salutation: fill.contact.trim() ? f(example.salutation) : NO_CONTACT_SALUTATION[lang],
    body: f(example.body),
    // The letter prints the name on its own line under the closing (cover.ts), so the example's own {name} line goes.
    closing: f(example.closing.replace(/\s*\{name\}\s*$/, '')),
  };
}

export const coverExamples = (lang: Lang) => COVER_EXAMPLES[lang];

/** The letter as plain text for a portal's text box: subject, salutation, text, closing, name (no address block). */
export function coverPlainText(input: CoverInput): string {
  const name = input.signatureName.trim() || input.sender.fullName.trim();
  const parts = [input.subject.trim(), input.salutation.trim(), input.body.trim(), [input.closing.trim(), name].filter(Boolean).join('\n')];
  return parts.filter(Boolean).join('\n\n') + '\n';
}
