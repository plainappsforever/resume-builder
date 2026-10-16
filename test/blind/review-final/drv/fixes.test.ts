/**
 * @jest-environment node
 */
import { countOccurrences } from '@/engine/keywords/match';
import { extractKeywords } from '@/engine/keywords/extract';
import { fileNamePart } from '@/engine/filenames';
import { isSafeExportPath } from '@/data/history';
test('P3.5 fixes still hold', () => {
  const st = (t: string, x: string) => { const o = countOccurrences(t, [x]); return o.exactCount > 0 ? 'found' : o.count > 0 ? 'variant' : 'missing'; };
  const out = {
    javaCompound: st('java', '5 Jahre Java-Entwicklung'),
    sqlCompound: st('sql', 'SQL-Datenbanken'),
    itIts: st('it', 'Improved its onboarding'),
    hrHrs: st('hr', 'HRs records'),
    goGoes: st('go', 'goes live'),
    csCss: st('cs', 'CSS'),
    teamfaehig: st('teamfähigkeit', 'Teamfaehigkeit'),
    nodejs: st('node.js', 'NodeJS'),
    itil: extractKeywords('Anforderungen\nITIL-Grundkenntnisse und ITIL-Prozesse').keywords.map((k) => k.term).includes('itil'),
    selfJunk: extractKeywords('Requirements\nSelf-motivated, hands-on').keywords.map((k) => k.term).filter((t) => ['self', 'hands'].includes(t)),
    benefitsBlock: extractKeywords('Requirements\nKubernetes\nWhat we offer\nGym membership').keywords.find((k) => k.term === 'gym')?.inRequirements,
    fullwidth: fileNamePart('Ｗide'),
    traversal: [isSafeExportPath('../../Library/LocalDatabase/app.db'), isSafeExportPath('/etc/hosts'), isSafeExportPath('exports/v1/123/a.pdf')],
  };
  console.log(JSON.stringify(out));
});
