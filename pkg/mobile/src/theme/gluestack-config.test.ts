import { describe, expect, it, vi } from 'vitest';

vi.mock('nativewind', () => ({ vars: (values: Record<string, string>) => values }));
vi.mock('./brand-colors', () => ({ primaryColorTriplets: { dark: '255 240 0', light: '248 211 0' } }));

import { gluestackConfig } from './gluestack-config';

describe('gluestackConfig', () => {
  it('recesses the image backdrop into whichever scheme is painting it', () => {
    expect(gluestackConfig.dark['--color-image-backdrop']).toBe('15 15 17');
    expect(gluestackConfig.light['--color-image-backdrop']).toBe('245 245 245');
  });
});
