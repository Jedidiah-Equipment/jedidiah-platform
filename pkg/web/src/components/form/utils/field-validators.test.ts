import { AssemblyName } from '@pkg/schema';
import { FieldApi, FormApi } from '@tanstack/react-form';
import { describe, expect, it } from 'vitest';
import { validateStructuralFieldOnMount } from './field-validators.js';

describe('validateStructuralFieldOnMount', () => {
  it('shows a field error when a structurally added field mounts invalid', () => {
    const form = new FormApi({
      defaultValues: {
        assemblies: [{ id: '00000000-0000-4000-8000-000000000101', kind: 'standard', name: '', parts: [] }],
      },
    });
    const field = new FieldApi({
      form,
      name: 'assemblies[0].name',
      validators: validateStructuralFieldOnMount(AssemblyName),
    });

    field.mount();

    expect(field.state.meta.errors).toContainEqual(expect.objectContaining({ message: 'Assembly name is required' }));
  });
});
