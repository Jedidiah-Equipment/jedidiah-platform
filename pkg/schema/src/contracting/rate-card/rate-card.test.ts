import { describe, expect, it } from 'vitest';
import { RateCreateInput, RatePatchInput } from './rate-card.js';

const measureTypeId = '00000000-0000-4000-8000-000000000001';
const rateId = '00000000-0000-4000-8000-000000000002';

describe('Rate inputs', () => {
  it('accepts time and measure rates only with the matching Measure Type shape', () => {
    expect(RateCreateInput.safeParse({ name: 'Hourly', basis: 'time', amount: 500 }).success).toBe(true);
    expect(
      RateCreateInput.safeParse({ name: 'Per hectare', basis: 'measure', measureTypeId, amount: 250 }).success,
    ).toBe(true);
    expect(RateCreateInput.safeParse({ name: 'Broken', basis: 'measure', amount: 250 }).success).toBe(false);
    expect(RateCreateInput.safeParse({ name: 'Broken', basis: 'time', measureTypeId, amount: 250 }).success).toBe(
      false,
    );
  });

  it('requires basis and Measure Type to travel together in patches', () => {
    expect(RatePatchInput.safeParse({ id: rateId, basis: 'time' }).success).toBe(false);
    expect(RatePatchInput.safeParse({ id: rateId, measureTypeId: null }).success).toBe(false);
    expect(RatePatchInput.safeParse({ id: rateId, basis: 'time', measureTypeId: null }).success).toBe(true);
  });

  it('refuses zero amounts because No charge is a Pricing option', () => {
    expect(RateCreateInput.safeParse({ name: 'Zero', basis: 'time', amount: 0 }).success).toBe(false);
  });
});
