// Check tab "Fix" (SPEC §5.5: every check opens the place to fix it). PURE: where a finding's FixTarget leads.
//  - headline / summary: the Content tab of this resume (they are edited per resume there);
//  - other profile fields and links: the Profile tab;
//  - a section title: the profile's section screen; an entry or bullet: "Edit for this resume only" (it shows the text this
//    resume prints, including its overrides, and can apply it to the profile);
//  - design / export: those tabs of this resume.
import type { FixTarget } from '@/engine/checks';

export type FixAction = { kind: 'tab'; tab: 'content' | 'design' | 'export' } | { kind: 'route'; href: string };

export function fixAction(target: FixTarget, versionId: number): FixAction {
  switch (target.kind) {
    case 'profile':
      return target.field === 'headline' || target.field === 'summary' ? { kind: 'tab', tab: 'content' } : { kind: 'route', href: '/profile' };
    case 'link':
      return { kind: 'route', href: '/profile' };
    case 'section':
      return { kind: 'route', href: `/profile/section/${target.sectionId}` };
    case 'entry':
    case 'bullet':
      return { kind: 'route', href: `/version/${versionId}/entry/${target.entryId}` };
    case 'design':
      return { kind: 'tab', tab: 'design' };
    case 'export':
      return { kind: 'tab', tab: 'export' };
  }
}
