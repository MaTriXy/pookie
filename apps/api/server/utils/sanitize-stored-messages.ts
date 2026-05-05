import type { ModelMessage } from "ai";

// Persisted thread state can reference tools that no longer exist in the
// current toolset (e.g. after a tool is removed). OpenAI's strict tool-call
// validation will reject orphan tool-call/tool-result parts. Drop any
// tool-call/tool-result whose toolName isn't in the current toolset, and
// drop the containing message if it becomes empty.
export const sanitizeStoredMessages = (
  messages: ModelMessage[],
  validToolNames: ReadonlySet<string>,
): ModelMessage[] => {
  const sanitized: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      const filteredContent = message.content.filter((part) => {
        if (part.type === "tool-call" || part.type === "tool-result") {
          return validToolNames.has(part.toolName);
        }
        return true;
      });
      if (filteredContent.length === 0) continue;
      sanitized.push({ ...message, content: filteredContent });
      continue;
    }

    if (message.role === "tool") {
      const filteredContent = message.content.filter((part) => {
        if (part.type === "tool-result") {
          return validToolNames.has(part.toolName);
        }
        return true;
      });
      if (filteredContent.length === 0) continue;
      sanitized.push({ ...message, content: filteredContent });
      continue;
    }

    sanitized.push(message);
  }

  return sanitized;
};
