import { describe, expect, it } from 'vitest';

import { resolveAppVariant } from './app-variant';

describe('resolveAppVariant', () => {
  it('resolves the staging variant to its package, scheme, name, and yellow Android icon', () => {
    const config = resolveAppVariant({ APP_VARIANT: 'staging' });

    expect(config.variant).toBe('staging');
    expect(config.androidPackage).toBe('za.co.jedidiahequipment.ops.staging');
    expect(config.scheme).toBe('jedidiahopsstaging');
    expect(config.displayName).toBe('Jedidiah Ops (Staging)');
    expect(config.iconConfig.icon).toBe('./assets/icon-staging.png');
    expect(config.iconConfig.adaptiveIcon.foregroundImage).toBe('./assets/adaptive-icon.png');
    expect(config.iconConfig.adaptiveIcon.backgroundColor).toBe('#FFF000');
  });

  it('resolves the production variant to the clean package, scheme, name, and icon', () => {
    const config = resolveAppVariant({ APP_VARIANT: 'production' });

    expect(config.variant).toBe('production');
    expect(config.androidPackage).toBe('za.co.jedidiahequipment.ops');
    expect(config.scheme).toBe('jedidiahops');
    expect(config.displayName).toBe('Jedidiah Ops');
    expect(config.iconConfig.icon).toBe('./assets/icon.png');
    expect(config.iconConfig.adaptiveIcon.foregroundImage).toBe('./assets/adaptive-icon.png');
    expect(config.iconConfig.adaptiveIcon.backgroundColor).toBe('#FFF000');
  });

  it('gives staging and production distinct package names so they install side by side', () => {
    const staging = resolveAppVariant({ APP_VARIANT: 'staging' });
    const production = resolveAppVariant({ APP_VARIANT: 'production' });

    expect(staging.androidPackage).not.toBe(production.androidPackage);
    expect(staging.scheme).not.toBe(production.scheme);
  });

  it('throws on an unknown variant', () => {
    expect(() => resolveAppVariant({ APP_VARIANT: 'development' })).toThrow(/Unknown APP_VARIANT/);
  });

  it('throws when APP_VARIANT is missing', () => {
    expect(() => resolveAppVariant({})).toThrow(/Unknown APP_VARIANT/);
  });
});
