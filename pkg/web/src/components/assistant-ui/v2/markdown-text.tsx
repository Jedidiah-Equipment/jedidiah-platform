import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from '@assistant-ui/react-markdown';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC, memo, useState } from 'react';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils.js';

import { AssistantMarkdownLink } from './assistant-markdown-link.js';
import { TooltipIconButton } from './tooltip-icon-button.js';

const MarkdownTextImpl = () => {
  return <MarkdownTextPrimitive className="aui-md" components={defaultComponents} remarkPlugins={[remarkGfm]} />;
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ code, language }) => {
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  return (
    <div className="mt-2.5 flex items-center justify-between rounded-t-lg border border-border/50 border-b-0 bg-muted/50 px-3 py-1.5 text-xs">
      <span className="font-medium text-muted-foreground lowercase">{language}</span>
      <TooltipIconButton
        onClick={() => {
          if (code && !isCopied) {
            copyToClipboard(code);
          }
        }}
        tooltip="Copy"
      >
        {isCopied ? <IconCheck /> : <IconCopy />}
      </TooltipIconButton>
    </div>
  );
};

function useCopyToClipboard({ copiedDuration = 3_000 }: { copiedDuration?: number } = {}) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = (value: string) => {
    if (!value) {
      return;
    }

    void navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { copyToClipboard, isCopied };
}

const defaultComponents = unstable_memoizeMarkdownComponents({
  a: AssistantMarkdownLink,
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn('my-2.5 border-muted-foreground/30 border-s-2 ps-3 text-muted-foreground italic', className)}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();

    return (
      <code
        className={cn(
          !isCodeBlock && 'rounded-md border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[0.85em]',
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
  h1: ({ className, ...props }) => (
    <h1 className={cn('mb-2 scroll-m-20 font-semibold text-base first:mt-0 last:mb-0', className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn('mt-3 mb-1.5 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0', className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn('mt-2.5 mb-1 scroll-m-20 font-semibold text-sm first:mt-0 last:mb-0', className)} {...props} />
  ),
  h4: ({ className, ...props }) => (
    <h4 className={cn('mt-2 mb-1 scroll-m-20 font-medium text-sm first:mt-0 last:mb-0', className)} {...props} />
  ),
  h5: ({ className, ...props }) => (
    <h5 className={cn('mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0', className)} {...props} />
  ),
  h6: ({ className, ...props }) => (
    <h6 className={cn('mt-2 mb-1 font-medium text-sm first:mt-0 last:mb-0', className)} {...props} />
  ),
  hr: ({ className, ...props }) => <hr className={cn('my-2 border-muted-foreground/20', className)} {...props} />,
  li: ({ className, ...props }) => <li className={cn('leading-normal', className)} {...props} />,
  ol: ({ className, ...props }) => (
    <ol className={cn('my-2 ms-4 list-decimal marker:text-muted-foreground [&>li]:mt-1', className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn('my-2.5 leading-normal first:mt-0 last:mb-0', className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        'overflow-x-auto rounded-t-none rounded-b-lg border border-border/50 border-t-0 bg-muted/30 p-3 text-xs leading-relaxed',
        className,
      )}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <table className={cn('my-2 w-full border-separate border-spacing-0 overflow-y-auto', className)} {...props} />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        'border-muted-foreground/20 border-s border-b px-2 py-1 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        'bg-muted px-2 py-1 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right',
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        'm-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg',
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn('my-2 ms-4 list-disc marker:text-muted-foreground [&>li]:mt-1', className)} {...props} />
  ),
});
