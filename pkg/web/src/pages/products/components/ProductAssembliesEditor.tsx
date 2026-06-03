import { formatCurrency } from '@pkg/domain';
import type { AssemblyInput, Part } from '@pkg/schema';
import { ChevronDownIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import React, { useMemo } from 'react';
import { fieldContext } from '@/components/form/hooks/form-context.js';
import { CurrencyField, useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { usePartCategoryOptions, usePartOptions } from '@/hooks/options/index.js';
import { cn } from '@/lib/utils.js';
import { getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';
import { emptyProductFormValues } from './types.js';

const ALL_CATEGORIES = '__all__';
const assemblyPartKeys = new WeakMap<AssemblyInput['parts'][number], string>();

type ProductAssembliesEditorProps = {
  assembliesField: ArrayFieldApi<AssemblyInput>;
  currencyCode: string;
};

type IndexedAssembly = {
  assembly: AssemblyInput;
  index: number;
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductAssembliesEditor: React.FC<ProductAssembliesEditorProps> = ({ assembliesField, currencyCode }) => {
  const [expandedAssemblyIds, setExpandedAssemblyIds] = React.useState<Set<string>>(new Set());

  const partOptions = usePartOptions({ pageSize: 0, sortBy: 'category', sortDirection: 'asc' });
  const categoryOptions = usePartCategoryOptions();
  const parts = partOptions.items;
  const categories = categoryOptions.items;
  const indexedAssemblies = assembliesField.state.value.map((assembly, index) => ({ assembly, index }));
  const standardAssemblies = getSortedAssemblies(indexedAssemblies, 'standard');
  const optionalAssemblies = getSortedAssemblies(indexedAssemblies, 'optional');
  const handleAddAssembly = (kind: AssemblyInput['kind']) => {
    const assembly = createAssembly(kind);

    assembliesField.pushValue(assembly);
    setExpandedAssemblyIds((current) => new Set(current).add(assembly.id ?? ''));
  };
  const handleExpandedChange = (assemblyId: string | undefined, isExpanded: boolean) => {
    if (!assemblyId) {
      return;
    }

    setExpandedAssemblyIds((current) => {
      const next = new Set(current);

      if (isExpanded) {
        next.add(assemblyId);
      } else {
        next.delete(assemblyId);
      }

      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <AssemblyGroup
        assemblies={standardAssemblies}
        categories={categories}
        expandedAssemblyIds={expandedAssemblyIds}
        kind="standard"
        onAdd={() => handleAddAssembly('standard')}
        onExpandedChange={handleExpandedChange}
        onRemove={assembliesField.removeValue}
        parts={parts}
        standardAssemblies={standardAssemblies}
        title="Standard Assemblies"
        currencyCode={currencyCode}
      />
      <AssemblyGroup
        assemblies={optionalAssemblies}
        categories={categories}
        expandedAssemblyIds={expandedAssemblyIds}
        kind="optional"
        onAdd={() => handleAddAssembly('optional')}
        onExpandedChange={handleExpandedChange}
        onRemove={assembliesField.removeValue}
        parts={parts}
        standardAssemblies={standardAssemblies}
        title="Optional Assemblies"
        currencyCode={currencyCode}
      />
    </div>
  );
};

type AssemblyGroupProps = {
  assemblies: IndexedAssembly[];
  categories: string[];
  expandedAssemblyIds: Set<string>;
  currencyCode: string;
  kind: AssemblyInput['kind'];
  parts: Part[];
  standardAssemblies: IndexedAssembly[];
  title: string;
  onAdd: () => void;
  onExpandedChange: (assemblyId: string | undefined, isExpanded: boolean) => void;
  onRemove: (index: number) => void;
};

const AssemblyGroup: React.FC<AssemblyGroupProps> = ({
  assemblies,
  categories,
  currencyCode,
  expandedAssemblyIds,
  kind,
  parts,
  standardAssemblies,
  title,
  onAdd,
  onExpandedChange,
  onRemove,
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-medium text-sm">{title}</h3>
      <Button size="sm" type="button" variant="outline" onClick={onAdd}>
        <PlusIcon />
        Add
      </Button>
    </div>
    <div className="flex flex-col gap-3">
      {assemblies.map(({ assembly, index }) => (
        <AssemblyRow
          assembly={assembly}
          categories={categories}
          index={index}
          key={assembly.id}
          isExpanded={Boolean(assembly.id && expandedAssemblyIds.has(assembly.id))}
          onExpandedChange={(isExpanded) => onExpandedChange(assembly.id, isExpanded)}
          onRemove={() => onRemove(index)}
          parts={parts}
          standardAssemblies={standardAssemblies}
          currencyCode={currencyCode}
        />
      ))}
    </div>
    {assemblies.length === 0 ? (
      <p className="text-muted-foreground text-sm">
        No {kind === 'standard' ? 'standard' : 'optional'} assemblies added.
      </p>
    ) : null}
  </section>
);

type AssemblyRowProps = {
  assembly: AssemblyInput;
  categories: string[];
  currencyCode: string;
  index: number;
  isExpanded: boolean;
  parts: Part[];
  standardAssemblies: IndexedAssembly[];
  onExpandedChange: (isExpanded: boolean) => void;
  onRemove: () => void;
};

const AssemblyRow: React.FC<AssemblyRowProps> = ({
  assembly,
  categories,
  currencyCode,
  index,
  isExpanded,
  parts,
  standardAssemblies,
  onExpandedChange,
  onRemove,
}) => {
  const productForm = useProductForm();
  const FormField = productForm.Field;
  const partOptions = useMemo(() => parts.toSorted(compareParts), [parts]);
  const assemblyFieldPrefix = `assemblies[${index}]`;

  return (
    <productForm.Subscribe selector={(state) => hasFieldErrorsForPrefix(state.fieldMeta, assemblyFieldPrefix)}>
      {(hasError) => (
        <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
          <div aria-invalid={hasError} className={cn('rounded-lg border p-3', hasError && 'border-destructive')}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <AssemblySummary
                assembly={assembly}
                currencyCode={currencyCode}
                standardAssemblies={standardAssemblies}
              />
              <div className="flex shrink-0 items-center gap-2">
                <CollapsibleTrigger render={<Button size="sm" type="button" variant="outline" />}>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="transition-transform group-aria-expanded/button:rotate-180"
                    data-icon="inline-start"
                  />
                  {isExpanded ? 'Done' : 'Edit'}
                </CollapsibleTrigger>
                <Button aria-label="Remove assembly" size="icon-sm" type="button" variant="ghost" onClick={onRemove}>
                  <Trash2Icon />
                </Button>
              </div>
            </div>
            <CollapsibleContent keepMounted>
              <div className="mt-4 flex flex-col gap-3">
                <div
                  className={
                    assembly.kind === 'optional'
                      ? 'grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(12rem,16rem)]'
                      : 'grid gap-3'
                  }
                >
                  <FormField name={`assemblies[${index}].name`}>
                    {(field: FieldApi<string>) => {
                      const errors = getFieldErrors(field.state.meta.errors);
                      const isInvalid = errors.length > 0;

                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel>Name</FieldLabel>
                          <Input
                            aria-invalid={isInvalid}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      );
                    }}
                  </FormField>
                  {assembly.kind === 'optional' ? (
                    <FormField name={`assemblies[${index}].price`}>
                      {(field) => (
                        <fieldContext.Provider value={field}>
                          <CurrencyField
                            autoComplete="off"
                            currencyCode={currencyCode}
                            label="Upgrade amount"
                            placeholder="0.00"
                          />
                        </fieldContext.Provider>
                      )}
                    </FormField>
                  ) : null}
                  {assembly.kind === 'optional' ? (
                    <OverridePicker index={index} standardAssemblies={standardAssemblies} />
                  ) : null}
                </div>
                <AssemblyPartsTable categories={categories} index={index} partOptions={partOptions} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </productForm.Subscribe>
  );
};

type AssemblySummaryProps = {
  assembly: AssemblyInput;
  currencyCode: string;
  standardAssemblies: IndexedAssembly[];
};

const AssemblySummary: React.FC<AssemblySummaryProps> = ({ assembly, currencyCode, standardAssemblies }) => {
  const partCount = assembly.parts.length;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 truncate font-medium text-sm leading-5">{assembly.name || 'Unnamed assembly'}</h4>
        <Badge variant="outline">{formatPartCount(partCount)}</Badge>
        {assembly.kind === 'optional' ? (
          <Badge variant="outline">{formatUpgradeAmount(assembly.price, currencyCode)}</Badge>
        ) : null}
        {assembly.kind === 'optional' ? (
          <Badge className="max-w-full" variant="outline">
            <span className="truncate">
              Replaces {formatOverrideSummary(assembly.overrideStandardAssemblyIds, standardAssemblies)}
            </span>
          </Badge>
        ) : null}
      </div>
    </div>
  );
};

type OverridePickerProps = {
  index: number;
  standardAssemblies: IndexedAssembly[];
};

const OverridePicker: React.FC<OverridePickerProps> = ({ index, standardAssemblies }) => {
  const FormField = useProductForm().Field;

  return (
    <FormField name={`assemblies[${index}].overrideStandardAssemblyIds`}>
      {(field: FieldApi<string[]>) => {
        const errors = getFieldErrors(field.state.meta.errors);
        const isInvalid = errors.length > 0;

        return (
          <Field data-invalid={isInvalid}>
            <FieldLabel>Replaces Assembly</FieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-invalid={isInvalid}
                    className="w-full justify-between"
                    disabled={standardAssemblies.length === 0}
                    type="button"
                    variant="outline"
                  />
                }
              >
                <span className="truncate">
                  <OverrideSummary selectedIds={field.state.value} standardAssemblies={standardAssemblies} />
                </span>
                <ChevronDownIcon data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-64">
                <DropdownMenuGroup>
                  {standardAssemblies.map((standardAssembly) => (
                    <OverrideCheckboxItem
                      key={standardAssembly.assembly.id ?? standardAssembly.index}
                      overrideField={field}
                      standardAssembly={standardAssembly}
                    />
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <FieldError errors={errors} />
          </Field>
        );
      }}
    </FormField>
  );
};

type OverrideSummaryProps = {
  selectedIds: string[];
  standardAssemblies: IndexedAssembly[];
};

const OverrideSummary: React.FC<OverrideSummaryProps> = ({ selectedIds, standardAssemblies }) => {
  const FormField = useProductForm().Field;
  const summary = getOverrideSelectionSummary(selectedIds, standardAssemblies);

  switch (summary.kind) {
    case 'no-assemblies':
      return 'No Assemblies';
    case 'none':
      return 'None';
    case 'multiple':
      return `${summary.count} assemblies selected`;
    case 'single':
      if (!summary.assembly) {
        return '1 assembly selected';
      }

      return (
        <FormField name={`assemblies[${summary.assembly.index}].name`}>
          {(field: FieldApi<string>) => field.state.value || 'Unnamed standard'}
        </FormField>
      );
  }
};

type OverrideCheckboxItemProps = {
  overrideField: FieldApi<string[]>;
  standardAssembly: IndexedAssembly;
};

const OverrideCheckboxItem: React.FC<OverrideCheckboxItemProps> = ({ overrideField, standardAssembly }) => {
  const FormField = useProductForm().Field;
  const standardId = standardAssembly.assembly.id;

  return (
    <DropdownMenuCheckboxItem
      checked={Boolean(standardId && overrideField.state.value.includes(standardId))}
      disabled={!standardId}
      onCheckedChange={(checked) => {
        if (!standardId) {
          return;
        }

        overrideField.handleChange(toggleOverrideSelection(overrideField.state.value, standardId, checked));
      }}
    >
      <FormField name={`assemblies[${standardAssembly.index}].name`}>
        {(field: FieldApi<string>) => field.state.value || 'Unnamed standard'}
      </FormField>
    </DropdownMenuCheckboxItem>
  );
};

type AssemblyPartsTableProps = {
  categories: string[];
  index: number;
  partOptions: Part[];
};

const AssemblyPartsTable: React.FC<AssemblyPartsTableProps> = ({ categories, index, partOptions }) => {
  const FormField = useProductForm().Field;

  return (
    <FormField name={`assemblies[${index}].parts`} mode="array">
      {(partsField: ArrayFieldApi<AssemblyInput['parts'][number]>) => (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">Parts</h4>
            <Button
              disabled={partOptions.length === 0}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => partsField.pushValue({ partId: '', quantity: 1 })}
            >
              <PlusIcon />
              Add part
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead className="w-36">Quantity</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partsField.state.value.map((part, partIndex) => (
                <AssemblyPartRow
                  categories={categories}
                  key={getAssemblyPartKey(part)}
                  part={part}
                  partIndex={partIndex}
                  partOptions={partOptions}
                  parentIndex={index}
                  onRemove={() => partsField.removeValue(partIndex)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FormField>
  );
};

type AssemblyPartRowProps = {
  categories: string[];
  parentIndex: number;
  part: AssemblyInput['parts'][number];
  partIndex: number;
  partOptions: Part[];
  onRemove: () => void;
};

const AssemblyPartRow: React.FC<AssemblyPartRowProps> = ({
  categories,
  parentIndex,
  part,
  partIndex,
  partOptions,
  onRemove,
}) => {
  const FormField = useProductForm().Field;
  const selectedPart = partOptions.find((option) => option.id === part.partId);
  const [category, setCategory] = React.useState(selectedPart?.category ?? ALL_CATEGORIES);
  const visibleParts = partOptions.filter((option) => category === ALL_CATEGORIES || option.category === category);

  return (
    <TableRow>
      <TableCell>
        <div className="grid gap-2 md:grid-cols-[10rem_minmax(12rem,1fr)]">
          <Select value={category} onValueChange={(value) => setCategory(value ?? ALL_CATEGORIES)}>
            <SelectTrigger>
              <SelectValue>{category === ALL_CATEGORIES ? 'All categories' : category}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {categories.map((categoryOption) => (
                  <SelectItem key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FormField name={`assemblies[${parentIndex}].parts[${partIndex}].partId`}>
            {(field: FieldApi<string>) => {
              const errors = getFieldErrors(field.state.meta.errors);
              const isInvalid = errors.length > 0;
              const selectedPart = partOptions.find((option) => option.id === field.state.value);
              const visiblePartOptions =
                selectedPart && !visibleParts.some((option) => option.id === selectedPart.id)
                  ? [selectedPart, ...visibleParts]
                  : visibleParts;

              return (
                <Field data-invalid={isInvalid}>
                  <Combobox
                    items={visiblePartOptions}
                    itemToStringLabel={formatPartLabel}
                    itemToStringValue={(option) => option.id}
                    onValueChange={(value) => field.handleChange(value?.id ?? '')}
                    value={selectedPart ?? null}
                  >
                    <ComboboxInput
                      aria-invalid={isInvalid}
                      className="w-full"
                      onBlur={field.handleBlur}
                      placeholder="Search for parts..."
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No parts found.</ComboboxEmpty>
                      <ComboboxList>
                        {(option: Part) => (
                          <ComboboxItem key={option.id} value={option}>
                            {formatPartLabel(option)}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldError errors={errors} />
                </Field>
              );
            }}
          </FormField>
        </div>
      </TableCell>
      <TableCell>
        <FormField name={`assemblies[${parentIndex}].parts[${partIndex}].quantity`}>
          {(field: FieldApi<number>) => {
            const errors = getFieldErrors(field.state.meta.errors);
            const isInvalid = errors.length > 0;

            return (
              <PartQuantityField
                errors={errors}
                field={field}
                isInvalid={isInvalid}
                parentIndex={parentIndex}
                partIndex={partIndex}
                partOptions={partOptions}
              />
            );
          }}
        </FormField>
      </TableCell>
      <TableCell>
        <Button aria-label="Remove part" size="icon" type="button" variant="ghost" onClick={onRemove}>
          <Trash2Icon />
        </Button>
      </TableCell>
    </TableRow>
  );
};

type PartQuantityFieldProps = {
  errors: ReturnType<typeof getFieldErrors>;
  field: FieldApi<number>;
  isInvalid: boolean;
  parentIndex: number;
  partIndex: number;
  partOptions: Part[];
};

const PartQuantityField: React.FC<PartQuantityFieldProps> = ({
  errors,
  field,
  isInvalid,
  parentIndex,
  partIndex,
  partOptions,
}) => {
  const productForm = useProductForm();

  return (
    <productForm.Subscribe selector={(state) => state.values.assemblies[parentIndex]?.parts[partIndex]?.partId}>
      {(partId) => {
        const selectedPart = partOptions.find((option) => option.id === partId);
        const quantityUnitDisplay = getPartQuantityUnitDisplay(selectedPart?.unitOfMeasure);

        return (
          <Field data-invalid={isInvalid}>
            <div className="flex items-center gap-2">
              <Input
                aria-invalid={isInvalid}
                className="w-24"
                inputMode="numeric"
                value={Number.isFinite(field.state.value) ? String(field.state.value) : ''}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(Number(event.target.value))}
              />
              {quantityUnitDisplay.suffix ? (
                <span className="min-w-6 text-muted-foreground text-sm" title={quantityUnitDisplay.label}>
                  {quantityUnitDisplay.suffix}
                </span>
              ) : null}
            </div>
            <FieldError errors={errors} />
          </Field>
        );
      }}
    </productForm.Subscribe>
  );
};

function getSortedAssemblies(assemblies: IndexedAssembly[], kind: AssemblyInput['kind']): IndexedAssembly[] {
  return assemblies
    .filter(({ assembly }) => assembly.kind === kind)
    .toSorted((left, right) => left.assembly.name.localeCompare(right.assembly.name));
}

function createAssembly(kind: AssemblyInput['kind']): AssemblyInput {
  if (kind === 'standard') {
    return {
      id: crypto.randomUUID(),
      kind,
      name: '',
      parts: [],
    };
  }

  return {
    id: crypto.randomUUID(),
    kind,
    name: '',
    overrideStandardAssemblyIds: [],
    parts: [],
    price: NaN,
  };
}

function compareParts(left: Part, right: Part): number {
  return left.category.localeCompare(right.category) || left.code.localeCompare(right.code);
}

function formatPartLabel(part: Part): string {
  return `${part.code} - ${part.name}`;
}

function formatPartCount(count: number): string {
  return `${count} ${count === 1 ? 'part' : 'parts'}`;
}

function formatUpgradeAmount(value: number, currencyCode: string): string {
  const amount = formatCurrency(value, currencyCode);

  return amount || 'Not set';
}

function formatOverrideSummary(selectedIds: string[], standardAssemblies: IndexedAssembly[]): string {
  const summary = getOverrideSelectionSummary(selectedIds, standardAssemblies);

  switch (summary.kind) {
    case 'no-assemblies':
      return 'no assemblies';
    case 'none':
      return 'none';
    case 'multiple':
      return `${summary.count} assemblies`;
    case 'single':
      return summary.assembly?.assembly.name || '1 assembly';
  }
}

type OverrideSelectionSummary =
  | { kind: 'no-assemblies' }
  | { kind: 'none' }
  | { kind: 'multiple'; count: number }
  | { kind: 'single'; assembly: IndexedAssembly | null };

function getOverrideSelectionSummary(
  selectedIds: string[],
  standardAssemblies: IndexedAssembly[],
): OverrideSelectionSummary {
  if (standardAssemblies.length === 0) {
    return { kind: 'no-assemblies' };
  }

  if (selectedIds.length === 0) {
    return { kind: 'none' };
  }

  if (selectedIds.length > 1) {
    return { kind: 'multiple', count: selectedIds.length };
  }

  return {
    kind: 'single',
    assembly: standardAssemblies.find(({ assembly }) => assembly.id === selectedIds[0]) ?? null,
  };
}

function hasFieldErrorsForPrefix(
  fieldMeta: Record<string, { errors?: unknown[] } | undefined>,
  prefix: string,
): boolean {
  return Object.entries(fieldMeta).some(
    ([fieldName, meta]) => fieldName.startsWith(prefix) && (meta?.errors?.length ?? 0) > 0,
  );
}

function toggleOverrideSelection(selectedIds: string[], id: string, checked: boolean): string[] {
  if (checked) {
    return selectedIds.includes(id) ? selectedIds : [...selectedIds, id];
  }

  return selectedIds.filter((selectedId) => selectedId !== id);
}

function getAssemblyPartKey(part: AssemblyInput['parts'][number]): string {
  const existingKey = assemblyPartKeys.get(part);

  if (existingKey) {
    return existingKey;
  }

  const key = crypto.randomUUID();
  assemblyPartKeys.set(part, key);
  return key;
}
