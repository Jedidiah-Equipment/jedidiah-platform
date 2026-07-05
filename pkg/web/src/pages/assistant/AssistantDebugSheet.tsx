import type { AiDebugInfo, AiToolDebugInfo } from '@pkg/api';
import { IconChevronDown } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import { useDebugSheetHotkey } from './useDebugSheetHotkey.js';

export function AssistantDebugSheet() {
  const [open, setOpen] = useState(false);
  const trpc = useTRPC();
  const debugQuery = useQuery({
    ...trpc.ai.debugInfo.queryOptions(),
    enabled: open,
  });

  const toggle = useCallback(() => setOpen((current) => !current), []);
  useDebugSheetHotkey(toggle);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-5xl" side="right">
        <SheetHeader>
          <SheetTitle>Assistant debug</SheetTitle>
          <SheetDescription>
            Context assembled for your session: system prompt and tool permission gates.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-6 p-4 pt-0">
            {debugQuery.isPending ? (
              <DebugSkeleton />
            ) : debugQuery.isError ? (
              <DebugError message={debugQuery.error.message} onRetry={() => void debugQuery.refetch()} />
            ) : (
              <AssistantDebugContent info={debugQuery.data} />
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export function AssistantDebugContent({ info }: { info: AiDebugInfo }) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-medium">System prompt</h3>
          <CopyValueButton label="Copy system prompt" value={info.systemPrompt} />
        </div>
        <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">{info.systemPrompt}</pre>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="font-heading text-sm font-medium">Tools ({info.tools.length})</h3>
        <div className="flex flex-col gap-1.5">
          {info.tools.map((tool) => (
            <AssistantDebugToolRow key={tool.name} tool={tool} />
          ))}
        </div>
      </section>
    </>
  );
}

function AssistantDebugToolRow({ tool }: { tool: AiToolDebugInfo }) {
  return (
    <Collapsible className={cn('rounded-md border', !tool.authorized && 'opacity-60')}>
      <CollapsibleTrigger
        render={
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40"
            type="button"
          />
        }
      >
        <IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/collapsible:rotate-180" />
        <span className="font-mono text-xs font-medium">{tool.name}</span>
        <Badge variant={tool.kind === 'write' ? 'destructive' : 'outline'}>{tool.kind}</Badge>
        <Badge variant="secondary">{tool.requiredPermission}</Badge>
        {!tool.authorized && (
          <Badge className="ml-auto" variant="outline">
            No access
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <div className="flex flex-col gap-3 p-3 text-xs">
          <FieldBlock label="Purpose">
            <p className="text-muted-foreground">{tool.purpose}</p>
          </FieldBlock>
          <BulletBlock label="Use when" items={tool.useWhen} />
          <BulletBlock label="Do not use when" items={tool.doNotUseWhen} />
          <BulletBlock label="Searchable identifiers" items={tool.searchableIdentifiers} />
          <BulletBlock label="Result identifiers" items={tool.resultIdentifiers} />
          {tool.linkTarget && (
            <FieldBlock label="Link target">
              <p className="text-muted-foreground">
                {tool.linkTarget.entity} → <span className="font-mono">{tool.linkTarget.href}</span>
              </p>
            </FieldBlock>
          )}
          <FieldBlock label="Input JSON schema">
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px]">
              {JSON.stringify(tool.jsonSchema, null, 2)}
            </pre>
          </FieldBlock>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FieldBlock({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

function BulletBlock({ items, label }: { items: readonly string[]; label: string }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <FieldBlock label={label}>
      <ul className="list-disc pl-4 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </FieldBlock>
  );
}

function DebugSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function DebugError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
      <p className="text-destructive">{message}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Retry
      </Button>
    </div>
  );
}
