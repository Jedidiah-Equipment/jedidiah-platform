import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AuditEvent, AuditListInput } from './audit.js';

describe('AuditEvent', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(AuditEvent)).not.toThrow();
  });
});

describe('AuditListInput', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(AuditListInput)).not.toThrow();
  });
});
