// "What next?" hint on the Home profile card (SPEC §6 "completeness hint"). PURE; returns an i18n-key-free code.
import type { Master } from '@/engine/types';

export type ProfileHint = 'name' | 'headline' | 'email' | 'phone' | 'experience' | 'education' | 'skills' | null;

/** The first missing thing, in the order a first resume needs it; null = nothing obvious is missing. */
export function nextProfileHint(master: Pick<Master, 'profile' | 'sections' | 'entries'>): ProfileHint {
  const { profile } = master;
  if (profile.fullName.trim() === '') return 'name';
  if (profile.headline.trim() === '') return 'headline';
  if (profile.email.trim() === '') return 'email';
  if (profile.phone.trim() === '') return 'phone';
  const has = (kind: string) =>
    master.sections.some((s) => s.kind === kind && master.entries.some((e) => e.sectionId === s.id && e.title.trim() !== ''));
  if (!has('experience')) return 'experience';
  if (!has('education')) return 'education';
  if (!has('skills')) return 'skills';
  return null;
}
