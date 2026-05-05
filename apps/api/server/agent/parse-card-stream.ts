import { jsonrepair } from "jsonrepair";

import { agentCardSchema } from "./response-schema";

import type { AgentCard } from "./response-schema";

const CARD_OPEN = "<card>";
const CARD_CLOSE = "</card>";
// Force-flush marker. The model uses `<br />` (HTML-line-break shape) to say
// "post whatever prose you have buffered as its own Slack message, then keep
// going." Useful when emitting 2+ unfurling URLs back-to-back: Slack stacks
// all of one message's unfurls below it, so dropping a `<br />` between links
// gives each its own message → each unfurl renders inline. Accept the common
// HTML variants `<br>`, `<br/>`, `<br />`, `<BR>`, `<br  />`, etc.
const BR_PATTERN = /<br\s*\/?\s*>/i;
// Conservative tail check: any of these prefixes could still complete into a
// full marker on the next chunk, so we hold them back rather than emit them
// as user-visible text.
const PARTIAL_MARKER_TAIL = /^<(c(a(rd?)?)?|b(r(\s*\/?\s*)?)?)?$/i;

export type CardStreamSegment =
  | { kind: "text"; text: string }
  | { kind: "card"; card: AgentCard }
  | { kind: "malformedCard"; raw: string; error: unknown }
  | { kind: "flush" };

interface ParserState {
  buffer: string;
  inCard: boolean;
  cardContent: string;
}

const createParserState = (): ParserState => ({
  buffer: "",
  inCard: false,
  cardContent: "",
});

// Try strict JSON.parse first (cheap, common path) and fall back to
// `jsonrepair` for the typical LLM-emitted malformations: trailing commas,
// single quotes, unquoted keys, stray `\`\`\`json` code fences, mismatched
// brackets, truncated tails, JS-style comments. Most card payloads parse
// strictly; only the broken ones pay the repair cost.
const parseJsonForgivingly = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
};

const parseCardJson = (
  raw: string,
): { ok: true; card: AgentCard } | { ok: false; error: unknown } => {
  try {
    const json = parseJsonForgivingly(raw);
    const validated = agentCardSchema.safeParse(json);
    if (!validated.success) return { ok: false, error: validated.error };
    return { ok: true, card: validated.data };
  } catch (parseError) {
    return { ok: false, error: parseError };
  }
};

interface NextMarker {
  kind: "card" | "flush";
  index: number;
  length: number;
}

const findNextOpeningMarker = (buffer: string): NextMarker | null => {
  const cardIdx = buffer.indexOf(CARD_OPEN);
  const brMatch = BR_PATTERN.exec(buffer);

  if (cardIdx === -1 && brMatch === null) return null;
  if (cardIdx !== -1 && (brMatch === null || cardIdx < brMatch.index)) {
    return { kind: "card", index: cardIdx, length: CARD_OPEN.length };
  }
  if (brMatch === null) return null;
  return { kind: "flush", index: brMatch.index, length: brMatch[0].length };
};

/**
 * Drain whatever segments can be extracted from the parser's current buffer.
 * Mutates `state` in place. Returns segments ready to post.
 *
 * The parser is conservative around partial sentinel matches at the buffer
 * tail (e.g. a chunk ending in "<ca" or "<br "). Those bytes stay buffered
 * until more input arrives or the stream finishes (where `flushTail` decides
 * what to do).
 */
const drainSegments = (state: ParserState): CardStreamSegment[] => {
  const segments: CardStreamSegment[] = [];

  while (true) {
    if (!state.inCard) {
      const marker = findNextOpeningMarker(state.buffer);
      if (!marker) {
        // No marker. Hold back any tail that might be a partial sentinel
        // ("<", "<c", "<ca", ..., "<b", "<br", "<br /") — flush the rest as
        // text.
        const safeFlushBoundary = findSafeTextBoundary(state.buffer);
        if (safeFlushBoundary > 0) {
          const text = state.buffer.slice(0, safeFlushBoundary);
          state.buffer = state.buffer.slice(safeFlushBoundary);
          if (text.length > 0) segments.push({ kind: "text", text });
        }
        break;
      }
      const textBefore = state.buffer.slice(0, marker.index);
      state.buffer = state.buffer.slice(marker.index + marker.length);
      if (textBefore.length > 0) {
        segments.push({ kind: "text", text: textBefore });
      }
      if (marker.kind === "flush") {
        segments.push({ kind: "flush" });
        continue;
      }
      state.inCard = true;
      state.cardContent = "";
      continue;
    }

    state.cardContent += state.buffer;
    state.buffer = "";
    const closeIndex = state.cardContent.indexOf(CARD_CLOSE);
    if (closeIndex === -1) break;

    const cardJson = state.cardContent.slice(0, closeIndex);
    const trailing = state.cardContent.slice(closeIndex + CARD_CLOSE.length);
    const parsed = parseCardJson(cardJson);
    if (parsed.ok) {
      segments.push({ kind: "card", card: parsed.card });
    } else {
      segments.push({
        kind: "malformedCard",
        raw: cardJson,
        error: parsed.error,
      });
    }
    state.cardContent = "";
    state.inCard = false;
    state.buffer = trailing;
  }

  return segments;
};

/**
 * Decide how many characters of the text buffer are safe to flush.
 *
 * The parser holds back any tail that could still be the prefix of `<card>`
 * or any `<br...>` variant (e.g. "<c", "<ca", "<b", "<br "). This keeps us
 * from emitting a stray "<" or "<br" as user-visible text right before a
 * real marker arrives in the next chunk.
 */
const findSafeTextBoundary = (buffer: string): number => {
  // Longest partial we ever hold back is `<br /` (5 chars) or `<card` (5
  // chars). 6 is a safe upper bound that's still a constant.
  const maxPartialLength = 6;
  for (
    let prefixLength = Math.min(maxPartialLength, buffer.length);
    prefixLength >= 1;
    prefixLength--
  ) {
    const tail = buffer.slice(buffer.length - prefixLength);
    if (PARTIAL_MARKER_TAIL.test(tail)) {
      return buffer.length - prefixLength;
    }
  }
  return buffer.length;
};

export interface CardStreamParser {
  ingest(chunk: string): CardStreamSegment[];
  flushTail(): CardStreamSegment[];
}

export const createCardStreamParser = (): CardStreamParser => {
  const state = createParserState();
  return {
    ingest(chunk: string) {
      state.buffer += chunk;
      return drainSegments(state);
    },
    flushTail() {
      const tail: CardStreamSegment[] = [];
      if (state.inCard) {
        // Stream ended without the model closing the <card>. Two cases:
        // 1) Buffered content has a `{` somewhere — looks like a real card
        //    that got truncated. Emit as malformed for the caller to log.
        // 2) No `{` at all — the model probably typed `<card>` as literal
        //    prose ("you can use <card> blocks..."). Re-emit the open
        //    sentinel + buffered content as text so the user still sees
        //    the rest of the response instead of silently losing it.
        if (state.cardContent.includes("{")) {
          tail.push({
            kind: "malformedCard",
            raw: state.cardContent,
            error: new Error("stream ended before </card> was emitted"),
          });
        } else {
          tail.push({
            kind: "text",
            text: `${CARD_OPEN}${state.cardContent}`,
          });
        }
        state.cardContent = "";
        state.inCard = false;
      }
      if (state.buffer.length > 0) {
        tail.push({ kind: "text", text: state.buffer });
        state.buffer = "";
      }
      return tail;
    },
  };
};
