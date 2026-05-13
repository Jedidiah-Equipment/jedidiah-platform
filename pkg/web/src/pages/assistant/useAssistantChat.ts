import type { AssistantEvent, ChatStreamMessage } from "@pkg/schema";
import { useCallback, useEffect, useRef, useState } from "react";

import { streamAssistantEvents } from "./sse-client.js";

export type AssistantChatStatus = "idle" | "streaming" | "error";

export type AssistantChatEntry =
  | {
      id: string;
      role: "assistant" | "user";
      content: string;
    }
  | {
      id: string;
      role: "tool";
      content: string;
      ok: boolean;
    };

export type AssistantChatState = {
  error: string | null;
  messages: AssistantChatEntry[];
  send: (content: string) => Promise<void>;
  status: AssistantChatStatus;
  stop: () => void;
};

export function useAssistantChat(): AssistantChatState {
  const [messages, setMessages] = useState<AssistantChatEntry[]>([]);
  const [status, setStatus] = useState<AssistantChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const statusRef = useRef(status);

  const setChatStatus = useCallback((nextStatus: AssistantChatStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const updateMessages = useCallback(
    (updater: (current: AssistantChatEntry[]) => AssistantChatEntry[]) => {
      setMessages((current) => {
        const nextMessages = updater(current);
        messagesRef.current = nextMessages;

        return nextMessages;
      });
    },
    [],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setChatStatus("idle");
  }, [setChatStatus]);

  const send = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();

      if (!trimmedContent || statusRef.current === "streaming") {
        return;
      }

      const userMessage = createChatMessage("user", trimmedContent);
      const assistantMessage = createChatMessage("assistant", "");
      const streamMessages = getStreamMessages([...messagesRef.current, userMessage]);
      const abortController = new AbortController();

      abortControllerRef.current = abortController;
      setError(null);
      setChatStatus("streaming");
      updateMessages((current) => [...current, userMessage, assistantMessage]);

      try {
        for await (const event of streamAssistantEvents({
          messages: streamMessages,
          signal: abortController.signal,
        })) {
          handleAssistantEvent({
            assistantMessageId: assistantMessage.id,
            event,
            updateMessages,
          });
        }

        setChatStatus("idle");
      } catch (caughtError) {
        if (isAbortError(caughtError)) {
          setChatStatus("idle");
          return;
        }

        const message = getErrorMessage(caughtError);
        setError(message);
        setChatStatus("error");
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [setChatStatus, updateMessages],
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    error,
    messages,
    send,
    status,
    stop,
  };
}

function handleAssistantEvent({
  assistantMessageId,
  event,
  updateMessages,
}: {
  assistantMessageId: string;
  event: AssistantEvent;
  updateMessages: (updater: (current: AssistantChatEntry[]) => AssistantChatEntry[]) => void;
}): void {
  switch (event.type) {
    case "token":
      updateMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId && message.role === "assistant"
            ? { ...message, content: message.content + event.delta }
            : message,
        ),
      );
      return;
    case "tool_call":
      updateMessages((current) => [...current, createToolMessage(formatToolCall(event))]);
      return;
    case "tool_result":
      updateMessages((current) => [
        ...current,
        createToolMessage(formatToolResult(event), event.ok),
      ]);
      return;
    case "error":
      throw new Error(event.message);
    case "done":
      return;
  }
}

function createChatMessage(role: "assistant" | "user", content: string): AssistantChatEntry {
  return {
    content,
    id: crypto.randomUUID(),
    role,
  };
}

function createToolMessage(content: string, ok = true): AssistantChatEntry {
  return {
    content,
    id: crypto.randomUUID(),
    ok,
    role: "tool",
  };
}

function getStreamMessages(messages: AssistantChatEntry[]): ChatStreamMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "tool" || !message.content.trim()) {
      return [];
    }

    return [
      {
        content: message.content,
        role: message.role,
      },
    ];
  });
}

function formatToolCall(event: Extract<AssistantEvent, { type: "tool_call" }>): string {
  return `[tool] ${event.name}(${formatToolArguments(event.args)})`;
}

function formatToolResult(event: Extract<AssistantEvent, { type: "tool_result" }>): string {
  return `[tool] ${event.name}(...) -> ${event.summary}`;
}

function formatToolArguments(args: unknown): string {
  if (args === null || args === undefined) {
    return "";
  }

  if (typeof args !== "object") {
    return String(args);
  }

  return Object.entries(args)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Assistant stream failed";
}
