import { SendIcon, SquareIcon, WrenchIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { Separator } from '@/components/ui/separator.js';
import { Textarea } from '@/components/ui/textarea.js';
import { cn } from '@/lib/utils.js';

import { type AssistantChatEntry, useAssistantChat } from './useAssistantChat.js';

export const AssistantPanel: React.FC = () => {
  const { error, messages, send, status, stop } = useAssistantChat();
  const [draft, setDraft] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const canSend = draft.trim().length > 0 && status !== 'streaming';

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    messageListRef.current?.scrollTo({
      behavior: 'smooth',
      top: messageListRef.current.scrollHeight,
    });
  }, [messages]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    const content = draft;
    setDraft('');
    void send(content);
  };

  return (
    <Card className="min-h-[calc(100vh-6rem)]">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardDescription>AI assistant</CardDescription>
          <CardTitle>Assistant</CardTitle>
          <p className="text-sm text-muted-foreground">This conversation is not saved.</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <Separator />

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Assistant error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div
          className="flex min-h-96 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3"
          ref={messageListRef}
        >
          {messages.length === 0 ? (
            <div className="flex h-full min-h-72 items-center justify-center text-sm text-muted-foreground">
              Start a conversation.
            </div>
          ) : (
            messages.map((message, index) => (
              <AssistantMessage
                isStreaming={status === 'streaming' && index === messages.length - 1}
                key={message.id}
                message={message}
              />
            ))
          )}
        </div>

        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <Textarea
            aria-label="Message"
            className="max-h-44 min-h-24 resize-none"
            disabled={status === 'streaming'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Message the assistant"
            value={draft}
          />
          <div className="flex items-center justify-end gap-2">
            {status === 'streaming' ? (
              <Button onClick={stop} type="button" variant="outline">
                <SquareIcon data-icon="inline-start" />
                Stop
              </Button>
            ) : null}
            <Button disabled={!canSend} type="submit">
              <SendIcon data-icon="inline-start" />
              Send
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const AssistantMessage: React.FC<{ isStreaming: boolean; message: AssistantChatEntry }> = ({
  isStreaming,
  message,
}) => {
  const isUser = message.role === 'user';
  const toolCalls = isUser ? [] : (message.toolCalls ?? []);

  if (!isUser && !message.content) {
    if (!isStreaming) {
      return null;
    }

    return (
      <div className="flex justify-start">
        <div className="animate-pulse rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          Thinking...
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[min(42rem,85%)]">
        {toolCalls.length > 0 ? <ToolCallBadge toolCalls={toolCalls} /> : null}
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-6',
            isUser
              ? 'whitespace-pre-wrap bg-primary text-primary-foreground'
              : 'prose prose-sm max-w-none border border-border bg-background dark:prose-invert',
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};

const ToolCallBadge: React.FC<{
  toolCalls: NonNullable<AssistantChatEntry['toolCalls']>;
}> = ({ toolCalls }) => {
  return (
    <HoverCard>
      <HoverCardTrigger
        closeDelay={100}
        delay={100}
        render={<Badge className="mb-1 cursor-default" variant="outline" />}
      >
        <WrenchIcon data-icon="inline-start" />
        {toolCalls.length} tool{toolCalls.length === 1 ? '' : 's'} called
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {toolCalls.map((toolCall) => (
              <Badge
                className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                key={toolCall.id}
                variant="secondary"
              >
                {toolCall.name}
              </Badge>
            ))}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const markdownComponents = {
  table({ children }: React.ComponentPropsWithoutRef<'table'>) {
    return (
      <div className="my-3 overflow-x-auto rounded-md border border-border">
        <table className="m-0 w-full min-w-max border-collapse text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }: React.ComponentPropsWithoutRef<'thead'>) {
    return <thead className="bg-muted/70">{children}</thead>;
  },
  th({ children }: React.ComponentPropsWithoutRef<'th'>) {
    return <th className="border-b border-border px-3 py-2 text-left font-medium text-foreground">{children}</th>;
  },
  td({ children }: React.ComponentPropsWithoutRef<'td'>) {
    return <td className="border-t border-border px-3 py-2 align-top">{children}</td>;
  },
} satisfies React.ComponentProps<typeof ReactMarkdown>['components'];
