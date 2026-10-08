import { formatNumber } from '@pkg/domain';
import type { KeytermCandidate, KeytermSource } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';

const keytermSourceLabels = {
  hint: 'Hint keyterm',
  machine: 'Machine',
  implement: 'Implement',
  category: 'Category',
  person: 'Person',
  farm: 'Farm',
  customer: 'Customer',
} as const satisfies Record<KeytermSource, string>;

// The API marks each per-note part of a prompt as `{{name}}`.
const PLACEHOLDER = /(\{\{[^}]+\}\})/;

/** A prompt exactly as sent, with its per-note placeholders picked out. */
function PromptText({ label, text }: { label: string; text: string }) {
  let offset = 0;
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs">
        {text === ''
          ? '(empty)'
          : text.split(PLACEHOLDER).map((part) => {
              const key = offset;
              offset += part.length;
              return PLACEHOLDER.test(part) ? (
                <mark key={key} className="rounded-sm bg-amber-500/20 px-0.5 text-amber-800 dark:text-amber-200">
                  {part}
                </mark>
              ) : (
                <span key={key}>{part}</span>
              );
            })}
      </pre>
    </div>
  );
}

function PromptCard({
  title,
  description,
  model,
  children,
}: {
  title: string;
  description: string;
  model: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          <Badge variant="outline">{model}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function CutOffKeyterms({ cutOff }: { cutOff: KeytermCandidate[] }) {
  const columns = useMemo<DataTableColumnDef<KeytermCandidate>[]>(
    () => [
      { accessorKey: 'keyterm', header: 'Keyterm' },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => keytermSourceLabels[row.original.source],
      },
    ],
    [],
  );
  const table = useDataTable({ columns, data: cutOff, enableSorting: false, enableColumnFilters: false });
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">Keyterms cut off</span>
      <DataTable
        emptyMessage="Every keyterm fits."
        hideGlobalFilter
        paginationMode="incremental"
        table={table}
        total={cutOff.length}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'keyterm' : 'keyterms'}`}
      />
    </div>
  );
}

/** The three model calls as they would be sent now; the page holds no prompt text of its own. */
export function PromptsPanel() {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingTranscriptions.prompts.queryOptions());
  if (query.error) return <ErrorMessage error={query.error} fallbackMessage="Unable to load the prompts." />;
  const prompts = query.data;
  if (!prompts) return <p className="text-sm text-muted-foreground">Loading the prompts…</p>;
  const { speech, tidy, derivation } = prompts;
  return (
    <div className="grid gap-4">
      <PromptCard
        title="1. Speech-to-text"
        model={speech.model}
        description={`No system prompt. The speech model is biased by the keyterms, comma-separated and cut at ${formatNumber(speech.maxChars)} characters.`}
      >
        <PromptText label="Keyterm prompt" text={speech.prompt} />
        <CutOffKeyterms cutOff={speech.cutOff} />
      </PromptCard>
      <PromptCard
        title="2. Tidy"
        model={tidy.model}
        description="Turns what was heard into the text the person is shown, applying the hints in force."
      >
        <PromptText label="System prompt" text={tidy.system} />
        <PromptText label="User prompt" text={tidy.prompt} />
      </PromptCard>
      <PromptCard
        title="3. Hint derivation"
        model={derivation.model}
        description="Runs after a corrected English Transcription is saved, and decides whether the correction teaches a hint."
      >
        <PromptText label="System prompt" text={derivation.system} />
        <PromptText label="User prompt" text={derivation.prompt} />
      </PromptCard>
    </div>
  );
}
