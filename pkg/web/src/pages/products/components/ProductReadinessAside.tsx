import {
  evaluateProductBrochureCompleteness,
  evaluateProductLanderCompleteness,
  isBrochureReady,
  isLanderReady,
} from '@pkg/domain';
import {
  BROCHURE_REQUIRED_FIELDS,
  type BrochureRequiredField,
  LANDER_REQUIRED_FIELDS,
  type LanderRequiredField,
  type Product,
} from '@pkg/schema';
import { IconCircleCheck, IconCircleDashed, IconFileText, IconWorld } from '@tabler/icons-react';
import type React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { cn } from '@/lib/utils.js';

// Surface accent shared with the form's FieldUsageLabel icons: the Lander is a purple globe, the Brochure a
// blue file, so the readiness box reads as the same surface a field row is tagged for.
const SURFACE_ACCENT = {
  brochure: { Icon: IconFileText, className: 'text-blue-600 dark:text-blue-400' },
  lander: { Icon: IconWorld, className: 'text-purple-600 dark:text-purple-400' },
} as const;

type ReadinessSurface = keyof typeof SURFACE_ACCENT;

// The Product edit tabs a readiness row can jump to. Only details/images/assemblies own required fields, but
// the full union keeps the navigate callback aligned with the tab values owned by ProductEditPage.
export type ProductTab = 'details' | 'bays' | 'assemblies' | 'images' | 'documents' | 'audit';

const BROCHURE_FIELD_LABELS: Record<BrochureRequiredField, string> = {
  category: 'Category',
  keyFeatures: 'At least one key feature',
  primary: 'Primary image',
  technicalDrawing: 'Technical drawing image',
  banner: 'Banner image',
  description: 'Product description',
  assemblies: 'At least one assembly',
};

const BROCHURE_FIELD_TABS: Record<BrochureRequiredField, ProductTab> = {
  category: 'details',
  keyFeatures: 'details',
  primary: 'images',
  technicalDrawing: 'images',
  banner: 'images',
  description: 'details',
  assemblies: 'assemblies',
};

const LANDER_FIELD_LABELS: Record<LanderRequiredField, string> = {
  category: 'Category',
  keyFeatures: 'At least one key feature',
  primary: 'Primary image',
  secondary1: 'Secondary image 1',
  secondary2: 'Secondary image 2',
  description: 'Product description',
  standardAssembly: 'At least one standard assembly',
};

const LANDER_FIELD_TABS: Record<LanderRequiredField, ProductTab> = {
  category: 'details',
  keyFeatures: 'details',
  primary: 'images',
  secondary1: 'images',
  secondary2: 'images',
  description: 'details',
  standardAssembly: 'assemblies',
};

type ReadinessRow = {
  key: string;
  label: string;
  satisfied: boolean;
  tab: ProductTab;
};

// Builds a box's checklist: the publish toggle as the first row, then each required field in vocabulary
// order. A row is satisfied when its field is filled (not in `missing`); satisfied rows render struck
// through. The "Enabled" row always points at the Details tab, where the toggle lives.
function buildRows<F extends string>(options: {
  enabled: boolean;
  fields: readonly F[];
  missing: readonly F[];
  labels: Record<F, string>;
  tabs: Record<F, ProductTab>;
}): ReadinessRow[] {
  const missing = new Set<F>(options.missing);

  return [
    { key: 'enabled', label: 'Enabled', satisfied: options.enabled, tab: 'details' },
    ...options.fields.map((field) => ({
      key: field,
      label: options.labels[field],
      satisfied: !missing.has(field),
      tab: options.tabs[field],
    })),
  ];
}

// Whether the aside has anything to show: it stays mounted until BOTH the brochure and the lander are ready.
export function isProductFullyReady(product: Product): boolean {
  return isBrochureReady(product) && isLanderReady(product);
}

type ProductReadinessAsideProps = {
  onNavigate: (tab: ProductTab) => void;
  product: Product;
};

// Readiness companion shown beside every Product tab. One box per publishable surface (Brochure, Lander);
// each box lists its publish toggle plus required fields, striking through what is done. A box disappears
// once its surface is ready; the whole aside disappears once both are (see {@link isProductFullyReady},
// which the parent uses to reclaim the full width). Reads the persisted Product, so it refreshes after
// autosave/image uploads invalidate the Product query rather than tracking live form state.
export const ProductReadinessAside: React.FC<ProductReadinessAsideProps> = ({ onNavigate, product }) => {
  const brochure = evaluateProductBrochureCompleteness(product);
  const lander = evaluateProductLanderCompleteness(product);

  return (
    <div className="flex flex-col gap-4">
      {isLanderReady(product) ? null : (
        <ReadinessBox
          onNavigate={onNavigate}
          rows={buildRows({
            enabled: product.landerEnabled,
            fields: LANDER_REQUIRED_FIELDS,
            labels: LANDER_FIELD_LABELS,
            missing: lander.missingFields,
            tabs: LANDER_FIELD_TABS,
          })}
          surface="lander"
          title="Lander"
        />
      )}
      {isBrochureReady(product) ? null : (
        <ReadinessBox
          onNavigate={onNavigate}
          rows={buildRows({
            enabled: product.brochureEnabled,
            fields: BROCHURE_REQUIRED_FIELDS,
            labels: BROCHURE_FIELD_LABELS,
            missing: brochure.missingFields,
            tabs: BROCHURE_FIELD_TABS,
          })}
          surface="brochure"
          title="Brochure"
        />
      )}
    </div>
  );
};

type ReadinessBoxProps = {
  onNavigate: (tab: ProductTab) => void;
  rows: ReadinessRow[];
  surface: ReadinessSurface;
  title: string;
};

const ReadinessBox: React.FC<ReadinessBoxProps> = ({ onNavigate, rows, surface, title }) => {
  const { Icon: SurfaceIcon, className: surfaceClassName } = SURFACE_ACCENT[surface];

  return (
    <Alert>
      <AlertTitle className="flex items-center gap-2">
        <SurfaceIcon aria-hidden className={cn('size-4 shrink-0', surfaceClassName)} />
        {title}
      </AlertTitle>
      <AlertDescription>
        <p>Complete the following to make this {title.toLowerCase()} ready:</p>
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.key}>
              <button
                className="flex w-full items-center gap-2 text-left hover:underline"
                onClick={() => onNavigate(row.tab)}
                type="button"
              >
                {row.satisfied ? (
                  <IconCircleCheck aria-hidden className="size-4 shrink-0 text-green-600 dark:text-green-500" />
                ) : (
                  <IconCircleDashed aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(!row.satisfied && 'text-muted-foreground')}>{row.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};
