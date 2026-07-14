import type { CatalogTranslationStatus } from '@pkg/schema';
import { IconLanguage, IconLoader2 } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';

type TranslationCounts = CatalogTranslationStatus['products'];

type CatalogTranslationHealthCardProps = {
  hasError?: boolean;
  isLoading?: boolean;
  isPending: boolean;
  onRetranslate: () => void;
  status?: CatalogTranslationStatus | undefined;
};

export const CatalogTranslationHealthCard: React.FC<CatalogTranslationHealthCardProps> = ({
  hasError = false,
  isLoading = false,
  isPending,
  onRetranslate,
  status,
}) => {
  const total = status ? catalogTranslationHealthCount(status) : 0;
  const description = hasError
    ? 'Unable to load Afrikaans translation health.'
    : isLoading || !status
      ? 'Checking Afrikaans translation health…'
      : total === 0
        ? 'All Afrikaans catalog translations are up to date.'
        : `${total} ${total === 1 ? 'item needs' : 'items need'} Afrikaans translation`;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <IconLanguage aria-hidden="true" className="size-4" />
            Afrikaans translation health
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <CardAction span="header">
          <Button
            disabled={isLoading || hasError || !status || total === 0 || isPending}
            onClick={onRetranslate}
            size="sm"
            type="button"
            variant="outline"
          >
            {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            {isPending ? 'Queuing…' : 'Retranslate stale'}
          </Button>
        </CardAction>
      </CardHeader>
      {status ? (
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <TranslationCounts label="Products" value={status.products} />
          <TranslationCounts label="Ranges" value={status.ranges} />
          <TranslationCounts label="Variants" value={status.variants} />
        </CardContent>
      ) : null}
    </Card>
  );
};

const TranslationCounts: React.FC<{ label: string; value: TranslationCounts }> = ({ label, value }) => (
  <div className="rounded-md border bg-muted/30 px-3 py-2">
    <div className="font-medium">{label}</div>
    <div className="text-muted-foreground text-xs">
      {value.missing} missing · {value.stale} stale
    </div>
  </div>
);

export function catalogTranslationHealthCount(status: CatalogTranslationStatus): number {
  return Object.values(status).reduce((total, counts) => total + counts.missing + counts.stale, 0);
}
