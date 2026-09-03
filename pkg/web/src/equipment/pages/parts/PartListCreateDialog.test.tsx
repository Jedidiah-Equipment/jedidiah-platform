import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({ useMutation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('@/equipment/hooks/options/index.js', () => ({
  usePartCategoryOptions: () => ({ isPending: false, items: [] }),
  useSupplierOptions: () => ({ isPending: false, selectOptions: [] }),
}));
vi.mock('@/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateParts: vi.fn() }),
}));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ parts: { create: { mutationOptions: (options: unknown) => options } } }),
}));
const setFieldValue = vi.fn();
/** The unit select's commit handler, captured on render so a unit change can be replayed. */
let commitUnitOfMeasure: ((unitOfMeasure: string) => void) | undefined;

vi.mock('@/components/form/index.js', () => ({
  CreateEntityDialog: ({ children }: { children: (form: React.ReactNode) => React.ReactNode }) => {
    const field = {
      CheckboxField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
      ComboboxField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
      CreatableComboboxField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
      NumberField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
      SelectField: ({ label, onValueCommit }: { label: React.ReactNode; onValueCommit?: (value: string) => void }) => {
        if (onValueCommit) commitUnitOfMeasure = onValueCommit;
        return <span>{label}</span>;
      },
      TextareaField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
      TextField: ({ label }: { label: React.ReactNode }) => <span>{label}</span>,
    };
    const form = {
      AppField: ({
        children: renderField,
        name,
      }: {
        children: (value: typeof field) => React.ReactNode;
        name: string;
      }) => <div data-field={name}>{renderField(field)}</div>,
      Subscribe: ({
        children: renderValue,
        selector,
      }: {
        children: (value: unknown) => React.ReactNode;
        selector: (state: { values: { isInternallyFabricated: boolean; unitOfMeasure: string } }) => unknown;
      }) => <>{renderValue(selector({ values: { isInternallyFabricated: false, unitOfMeasure: 'mm' } }))}</>,
      setFieldValue,
    };

    return <>{children(form as unknown as React.ReactNode)}</>;
  },
}));

import { PartListCreateDialog } from './PartListCreateDialog.js';

describe('PartListCreateDialog', () => {
  it('mounts every required bought and linear Part field', () => {
    const html = renderToStaticMarkup(<PartListCreateDialog onCreated={vi.fn()} onOpenChange={vi.fn()} open={true} />);

    for (const name of [
      'name',
      'code',
      'category',
      'finish',
      'supplierId',
      'supplierCode',
      'unitOfMeasure',
      'standardPurchaseLengthMm',
      'description',
    ]) {
      expect(html).toContain(`data-field="${name}"`);
    }
  });

  it('drops a length stranded by a move off millimetres, which would fail submit on a hidden field', () => {
    renderToStaticMarkup(<PartListCreateDialog onCreated={vi.fn()} onOpenChange={vi.fn()} open={true} />);
    setFieldValue.mockClear();

    commitUnitOfMeasure?.('piece');
    expect(setFieldValue).toHaveBeenCalledWith('standardPurchaseLengthMm', Number.NaN);

    setFieldValue.mockClear();
    commitUnitOfMeasure?.('mm');
    expect(setFieldValue).not.toHaveBeenCalled();
  });
});
