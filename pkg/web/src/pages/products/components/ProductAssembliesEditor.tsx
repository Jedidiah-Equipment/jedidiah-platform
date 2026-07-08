import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { formatCurrency } from '@pkg/domain';
import { type AssemblyInput, AssemblyName, AssemblyPrice, type Part, UUID } from '@pkg/schema';
import { IconChevronDown, IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import React, { useMemo } from 'react';
import { FieldUsageLabel, PRODUCT_FIELD_USAGE } from '@/components/catalog/index.js';
import { createStableRowKeys } from '@/components/form/create-stable-row-keys.js';
import { fieldContext } from '@/components/form/hooks/form-context.js';
import { CreatableComboboxField, CurrencyField, useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { validateStructuralFieldOnMount } from '@/components/form/utils/field-validators.js';
import { requiredSelection } from '@/components/form/utils/form-schema.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from '@/components/ui/card.js';
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
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table.js';
import { useAssemblyNameOptions, usePartCategoryOptions, usePartOptions } from '@/hooks/options/index.js';
import { cn } from '@/lib/utils.js';
import { getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';
import { emptyProductFormValues, getEligibleAssemblyNames } from './types.js';

const ALL_CATEGORIES = '__all__';
const AssemblyPartSelection = requiredSelection(UUID, 'Select a part');
const getAssemblyPartKey = createStableRowKeys<AssemblyInput['parts'][number]>('assembly-part');

const ASSEMBLY_NAME_FIELD_VALIDATORS = validateStructuralFieldOnMount(AssemblyName);
const ASSEMBLY_PRICE_FIELD_VALIDATORS = validateStructuralFieldOnMount(AssemblyPrice);
const ASSEMBLY_PART_FIELD_VALIDATORS = validateStructuralFieldOnMount(AssemblyPartSelection);

type ProductAssembliesEditorProps = {
  assembliesField: ArrayFieldApi<AssemblyInput>;
  currencyCode: string;
  onStructuralChange: () => void;
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

export const ProductAssembliesEditor: React.FC<ProductAssembliesEditorProps> = ({
  assembliesField,
  currencyCode,
  onStructuralChange,
}) => {
  const [expandedAssemblyIds, setExpandedAssemblyIds] = React.useState<Set<string>>(new Set());

  const partOptions = usePartOptions({ pageSize: 0, sortBy: 'category', sortDirection: 'asc' });
  const categoryOptions = usePartCategoryOptions();
  const assemblyNameOptions = useAssemblyNameOptions();
  const parts = partOptions.items;
  const categories = categoryOptions.items;
  const assemblyNames = assemblyNameOptions.items;
  const indexedAssemblies = assembliesField.state.value.map((assembly, index) => ({ assembly, index }));
  const standardAssemblies = getAssembliesByKind(indexedAssemblies, 'standard');
  const optionalAssemblies = getAssembliesByKind(indexedAssemblies, 'optional');
  const handleAddAssembly = (kind: AssemblyInput['kind']) => {
    const assembly = createAssembly(kind);
    const firstOfKindIndex = indexedAssemblies.find((entry) => entry.assembly.kind === kind)?.index;

    // New assemblies appear at the start of their kind group, so insert before the
    // first same-kind item in the flat array (or append when the group is empty).
    if (firstOfKindIndex === undefined) {
      assembliesField.pushValue(assembly);
    } else {
      // `dontValidate` keeps the insert synchronous. TanStack's async insert awaits a
      // field validation before it shifts field meta, which lets React remount the
      // shifted (id-keyed) rows first; the meta shift then copies the new empty row's
      // onMount error onto the next assembly, marking a valid row invalid. The new
      // row's own onMount and the whole-form autosave flush still surface validation.
      assembliesField.insertValue(firstOfKindIndex, assembly, { dontValidate: true });
    }

    setExpandedAssemblyIds((current) => new Set(current).add(assembly.id ?? ''));
    onStructuralChange();
  };
  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return;
    }

    assembliesField.moveValue(fromIndex, toIndex);
    onStructuralChange();
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
        assemblyNames={assemblyNames}
        categories={categories}
        expandedAssemblyIds={expandedAssemblyIds}
        kind="standard"
        onAdd={() => handleAddAssembly('standard')}
        onExpandedChange={handleExpandedChange}
        onRemove={(index) => {
          assembliesField.removeValue(index);
          onStructuralChange();
        }}
        onReorder={handleReorder}
        onStructuralChange={onStructuralChange}
        parts={parts}
        standardAssemblies={standardAssemblies}
        title="Standard Assemblies"
        currencyCode={currencyCode}
      />
      <AssemblyGroup
        assemblies={optionalAssemblies}
        assemblyNames={assemblyNames}
        categories={categories}
        expandedAssemblyIds={expandedAssemblyIds}
        kind="optional"
        onAdd={() => handleAddAssembly('optional')}
        onExpandedChange={handleExpandedChange}
        onRemove={(index) => {
          assembliesField.removeValue(index);
          onStructuralChange();
        }}
        onReorder={handleReorder}
        onStructuralChange={onStructuralChange}
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
  assemblyNames: string[];
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
  onReorder: (fromIndex: number, toIndex: number) => void;
  onStructuralChange: () => void;
};

const AssemblyGroup: React.FC<AssemblyGroupProps> = ({
  assemblies,
  assemblyNames,
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
  onReorder,
  onStructuralChange,
}) => {
  // A small distance constraint keeps clicks on the Edit/Remove buttons and inputs from
  // being interpreted as a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sortableIds = assemblies.map(({ assembly }) => assembly.id ?? '');
  const description =
    kind === 'standard'
      ? 'Included by default when quoting this Product.'
      : 'Customer-selectable price adjustments for this Product.';

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // The sortable context only contains this kind group's ids, so the standard/optional
    // boundary can never be crossed. Translate the within-group drag to flat-array indices.
    const fromIndex = assemblies.find(({ assembly }) => assembly.id === active.id)?.index;
    const toIndex = assemblies.find(({ assembly }) => assembly.id === over.id)?.index;

    if (fromIndex === undefined || toIndex === undefined) {
      return;
    }

    onReorder(fromIndex, toIndex);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FieldUsageLabel usage={PRODUCT_FIELD_USAGE.assemblies}>{title}</FieldUsageLabel>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" onClick={onAdd}>
            <IconPlus data-icon="inline-start" />
            Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardSeparator />
      <CardContent>
        {assemblies.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyIcon />
              <EmptyTitle>No {kind === 'standard' ? 'standard' : 'optional'} assemblies added.</EmptyTitle>
              <EmptyDescription>Add an assembly from the header to define this Product's build.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            sensors={sensors}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {assemblies.map(({ assembly, index }) => (
                  <AssemblyRow
                    assembly={assembly}
                    assemblyNames={assemblyNames}
                    categories={categories}
                    index={index}
                    key={assembly.id}
                    isExpanded={Boolean(assembly.id && expandedAssemblyIds.has(assembly.id))}
                    onExpandedChange={(isExpanded) => onExpandedChange(assembly.id, isExpanded)}
                    onRemove={() => onRemove(index)}
                    onStructuralChange={onStructuralChange}
                    parts={parts}
                    standardAssemblies={standardAssemblies}
                    currencyCode={currencyCode}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
};

type AssemblyRowProps = {
  assembly: AssemblyInput;
  assemblyNames: string[];
  categories: string[];
  currencyCode: string;
  index: number;
  isExpanded: boolean;
  parts: Part[];
  standardAssemblies: IndexedAssembly[];
  onExpandedChange: (isExpanded: boolean) => void;
  onRemove: () => void;
  onStructuralChange: () => void;
};

const AssemblyRow: React.FC<AssemblyRowProps> = ({
  assembly,
  assemblyNames,
  categories,
  currencyCode,
  index,
  isExpanded,
  parts,
  standardAssemblies,
  onExpandedChange,
  onRemove,
  onStructuralChange,
}) => {
  const productForm = useProductForm();
  const FormField = productForm.Field;
  const partOptions = useMemo(() => parts.toSorted(compareParts), [parts]);
  const assemblyFieldPrefix = `assemblies[${index}]`;
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: assembly.id ?? '',
  });
  const sortableStyle: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <productForm.Subscribe selector={(state) => hasFieldErrorsForPrefix(state.fieldMeta, assemblyFieldPrefix)}>
      {(hasError) => (
        <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
          <Card
            ref={setNodeRef}
            size="sm"
            style={sortableStyle}
            aria-invalid={hasError}
            className={cn(
              'gap-0',
              hasError && 'border-destructive',
              isDragging && 'relative z-10 opacity-80 shadow-lg',
            )}
          >
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button
                  aria-label="Reorder assembly"
                  className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  {...attributes}
                  {...listeners}
                >
                  <IconGripVertical />
                </Button>
                <AssemblySummary
                  assembly={assembly}
                  currencyCode={currencyCode}
                  standardAssemblies={standardAssemblies}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CollapsibleTrigger render={<Button size="sm" type="button" variant="outline" />}>
                  <IconChevronDown
                    aria-hidden="true"
                    className="transition-transform group-aria-expanded/button:rotate-180"
                    data-icon="inline-start"
                  />
                  {isExpanded ? 'Done' : 'Edit'}
                </CollapsibleTrigger>
                <Button aria-label="Remove assembly" size="icon-sm" type="button" variant="ghost" onClick={onRemove}>
                  <IconTrash />
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent keepMounted>
              <CardContent className="mt-3 flex flex-col gap-3">
                <div
                  className={
                    assembly.kind === 'optional'
                      ? 'grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(12rem,16rem)]'
                      : 'grid gap-3'
                  }
                >
                  <FormField name={`assemblies[${index}].name`} validators={ASSEMBLY_NAME_FIELD_VALIDATORS}>
                    {(field) => (
                      <fieldContext.Provider value={field}>
                        <AssemblyNameField assemblyNames={assemblyNames} index={index} />
                      </fieldContext.Provider>
                    )}
                  </FormField>
                  {assembly.kind === 'optional' ? (
                    <FormField name={`assemblies[${index}].price`} validators={ASSEMBLY_PRICE_FIELD_VALIDATORS}>
                      {(field) => (
                        <fieldContext.Provider value={field}>
                          <CurrencyField
                            autoComplete="off"
                            currencyCode={currencyCode}
                            label="Price adjustment"
                            placeholder="0.00"
                          />
                        </fieldContext.Provider>
                      )}
                    </FormField>
                  ) : null}
                  {assembly.kind === 'optional' ? (
                    <OverridePicker
                      index={index}
                      onStructuralChange={onStructuralChange}
                      standardAssemblies={standardAssemblies}
                    />
                  ) : null}
                </div>
                <AssemblyPartsTable
                  categories={categories}
                  index={index}
                  onStructuralChange={onStructuralChange}
                  partOptions={partOptions}
                />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </productForm.Subscribe>
  );
};

type AssemblyNameFieldProps = {
  assemblyNames: string[];
  index: number;
};

// Free-text autocomplete over the shared CreatableComboboxField: the typed text *is* the field
// value, and a name matching nothing is accepted as typed (`creatable={false}` keeps the novel name
// without offering a "Use X" row). Names already used by the product's other assemblies are dropped
// from the options using live form state, so the user can't pick a name the within-product duplicate
// check would reject.
const AssemblyNameField: React.FC<AssemblyNameFieldProps> = ({ assemblyNames, index }) => {
  const productForm = useProductForm();

  return (
    <productForm.Subscribe selector={(state) => getOtherAssemblyNames(state.values.assemblies, index)}>
      {(excludedNames) => (
        <CreatableComboboxField
          creatable={false}
          emptyMessage="No matching assembly names."
          label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.assemblies}>Name</FieldUsageLabel>}
          options={getEligibleAssemblyNames(assemblyNames, excludedNames)}
          placeholder="Assembly name"
        />
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
          <Badge variant="outline">{formatAssemblyPriceAdjustment(assembly.price, currencyCode)}</Badge>
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
  onStructuralChange: () => void;
  standardAssemblies: IndexedAssembly[];
};

const OverridePicker: React.FC<OverridePickerProps> = ({ index, onStructuralChange, standardAssemblies }) => {
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
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-64">
                <DropdownMenuGroup>
                  {standardAssemblies.map((standardAssembly) => (
                    <OverrideCheckboxItem
                      key={standardAssembly.assembly.id ?? standardAssembly.index}
                      onStructuralChange={onStructuralChange}
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
  onStructuralChange: () => void;
  overrideField: FieldApi<string[]>;
  standardAssembly: IndexedAssembly;
};

const OverrideCheckboxItem: React.FC<OverrideCheckboxItemProps> = ({
  onStructuralChange,
  overrideField,
  standardAssembly,
}) => {
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
        onStructuralChange();
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
  onStructuralChange: () => void;
  partOptions: Part[];
};

const AssemblyPartsTable: React.FC<AssemblyPartsTableProps> = ({
  categories,
  index,
  onStructuralChange,
  partOptions,
}) => {
  const FormField = useProductForm().Field;

  return (
    <FormField name={`assemblies[${index}].parts`} mode="array">
      {(partsField: ArrayFieldApi<AssemblyInput['parts'][number]>) => {
        const assemblyParts = partsField.state.value ?? [];

        return (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Parts</h4>
              <Button
                disabled={partOptions.length === 0}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  partsField.pushValue({ partId: '', quantity: 1 });
                  onStructuralChange();
                }}
              >
                <IconPlus />
                Add part
              </Button>
            </div>
            <Table>
              <TableBody>
                {assemblyParts.map((part, partIndex) => (
                  <AssemblyPartRow
                    categories={categories}
                    key={getAssemblyPartKey(part)}
                    part={part}
                    partIndex={partIndex}
                    partOptions={partOptions}
                    parentIndex={index}
                    onRemove={() => {
                      partsField.removeValue(partIndex);
                      onStructuralChange();
                    }}
                    onStructuralChange={onStructuralChange}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        );
      }}
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
  onStructuralChange: () => void;
};

const AssemblyPartRow: React.FC<AssemblyPartRowProps> = ({
  categories,
  parentIndex,
  part,
  partIndex,
  partOptions,
  onRemove,
  onStructuralChange,
}) => {
  const FormField = useProductForm().Field;
  const selectedPart = partOptions.find((option) => option.id === part.partId);
  const [category, setCategory] = React.useState(selectedPart?.category ?? ALL_CATEGORIES);
  const visibleParts = partOptions.filter((option) => category === ALL_CATEGORIES || option.category === category);

  return (
    <TableRow>
      <TableCell>
        <div className="grid gap-2 md:grid-cols-[13rem_minmax(12rem,1fr)]">
          <Select value={category} onValueChange={(value) => setCategory(value ?? ALL_CATEGORIES)}>
            <SelectTrigger className="w-full min-w-0">
              <SelectValue className="min-w-0 truncate">
                {category === ALL_CATEGORIES ? 'All categories' : category}
              </SelectValue>
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
          <FormField
            name={`assemblies[${parentIndex}].parts[${partIndex}].partId`}
            validators={ASSEMBLY_PART_FIELD_VALIDATORS}
          >
            {(field: FieldApi<string>) => {
              const errors = getFieldErrors(field.state.meta.errors);
              const isInvalid = errors.length > 0;
              const selectedPart = partOptions.find((option) => option.id === field.state.value);
              const visiblePartOptions =
                selectedPart && !visibleParts.some((option) => option.id === selectedPart.id)
                  ? [selectedPart, ...visibleParts]
                  : visibleParts;

              return (
                <AssemblyPartPickerField
                  field={field}
                  isInvalid={isInvalid}
                  options={visiblePartOptions}
                  selectedPart={selectedPart ?? null}
                  onStructuralChange={onStructuralChange}
                />
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
          <IconTrash />
        </Button>
      </TableCell>
    </TableRow>
  );
};

type AssemblyPartPickerFieldProps = {
  field: FieldApi<string>;
  isInvalid: boolean;
  options: Part[];
  selectedPart: Part | null;
  onStructuralChange: () => void;
};

const AssemblyPartPickerField: React.FC<AssemblyPartPickerFieldProps> = ({
  field,
  isInvalid,
  options,
  selectedPart,
  onStructuralChange,
}) => {
  return (
    <Field data-invalid={isInvalid}>
      <Combobox
        items={options}
        itemToStringLabel={formatPartLabel}
        itemToStringValue={(option) => option.id}
        onValueChange={(value) => {
          field.handleChange(value?.id ?? '');
          onStructuralChange();
        }}
        value={selectedPart}
      >
        <ComboboxInput
          aria-invalid={isInvalid}
          className="w-full"
          onBlur={field.handleBlur}
          placeholder="Select part"
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
    </Field>
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
              <span className="font-medium text-sm">Qty</span>
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

// Names belonging to the product's *other* assemblies (live form state), used to exclude
// already-taken names from the current row's suggestions. The current row is skipped so its own
// typed name never filters its dropdown.
function getOtherAssemblyNames(assemblies: { name: string }[], currentIndex: number): string[] {
  return assemblies.filter((_, index) => index !== currentIndex).map((assembly) => assembly.name);
}

function getAssembliesByKind(assemblies: IndexedAssembly[], kind: AssemblyInput['kind']): IndexedAssembly[] {
  // Render in persisted array order; the server owns ordering via display_order.
  return assemblies.filter(({ assembly }) => assembly.kind === kind);
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

function formatAssemblyPriceAdjustment(value: number, currencyCode: string): string {
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
