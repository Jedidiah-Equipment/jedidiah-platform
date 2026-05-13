import { describe, expect, it } from "vitest";

import { ChatStreamInput } from "./chat-stream.js";

describe("ChatStreamInput", () => {
  it("accepts a capped message payload", () => {
    expect(
      ChatStreamInput.parse({
        messages: [
          {
            role: "user",
            content: "Show me compact loaders.",
          },
        ],
      }),
    ).toEqual({
      messages: [
        {
          role: "user",
          content: "Show me compact loaders.",
        },
      ],
    });
  });

  it("rejects too many messages", () => {
    expect(() =>
      ChatStreamInput.parse({
        messages: Array.from({ length: 41 }, () => ({
          role: "user",
          content: "Show me compact loaders.",
        })),
      }),
    ).toThrow();
  });

  it("rejects oversized message content", () => {
    expect(() =>
      ChatStreamInput.parse({
        messages: [
          {
            role: "user",
            content: "a".repeat(4_001),
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects payloads over 64KB", () => {
    expect(() =>
      ChatStreamInput.parse({
        messages: Array.from({ length: 40 }, () => ({
          role: "user",
          content: "a".repeat(2_000),
        })),
      }),
    ).toThrow();
  });
});
