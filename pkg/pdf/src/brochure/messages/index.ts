import type { Locale } from '@pkg/schema';

import { af } from './af.js';
import { en } from './en.js';
import type { Messages } from './types.js';

export const brochureMessages = { en, af } satisfies Record<Locale, Messages>;
