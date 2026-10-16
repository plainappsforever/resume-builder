// The six resume templates (D18) + the cover letter. PURE.
import type { TemplateId } from '@/engine/types';

import { classic } from './classic';
import { compact } from './compact';
import { executive } from './executive';
import { lebenslauf } from './lebenslauf';
import { modern } from './modern';
import { plain } from './plain';
import type { TemplateSpec } from './shared';

export const TEMPLATES: Record<TemplateId, TemplateSpec> = { classic, modern, compact, executive, lebenslauf, plain };
