import { describe, expect, it } from "vitest";

import { createCardStreamParser } from "../server/agent/parse-card-stream";

import type { CardStreamSegment } from "../server/agent/parse-card-stream";

const drainAll = (input: string): CardStreamSegment[] => {
  const parser = createCardStreamParser();
  const segments: CardStreamSegment[] = [
    ...parser.ingest(input),
    ...parser.flushTail(),
  ];
  return segments;
};

const drainStreamed = (chunks: string[]): CardStreamSegment[] => {
  const parser = createCardStreamParser();
  const segments: CardStreamSegment[] = [];
  for (const chunk of chunks) segments.push(...parser.ingest(chunk));
  segments.push(...parser.flushTail());
  return segments;
};

describe("parse-card-stream <br /> flush marker", () => {
  it("emits a flush segment between two prose paragraphs", () => {
    const segments = drainAll("first message<br />second message");
    expect(segments).toEqual([
      { kind: "text", text: "first message" },
      { kind: "flush" },
      { kind: "text", text: "second message" },
    ]);
  });

  it("accepts <br>, <br/>, <br />, and case variants", () => {
    for (const marker of [
      "<br>",
      "<br/>",
      "<br />",
      "<BR>",
      "<br  />",
      "<Br/>",
    ]) {
      const segments = drainAll(`a${marker}b`);
      expect(segments).toEqual([
        { kind: "text", text: "a" },
        { kind: "flush" },
        { kind: "text", text: "b" },
      ]);
    }
  });

  it("emits multiple flushes in order", () => {
    const segments = drainAll("one<br />two<br />three");
    expect(segments).toEqual([
      { kind: "text", text: "one" },
      { kind: "flush" },
      { kind: "text", text: "two" },
      { kind: "flush" },
      { kind: "text", text: "three" },
    ]);
  });

  it("interleaves flushes with cards", () => {
    const card =
      '<card>{"type":"card","title":null,"subtitle":null,"children":[{"type":"row","text":"hi","accessory":null,"context":null}]}</card>';
    const segments = drainAll(`lead-in<br />${card}<br />tail`);
    const kinds = segments.map((s) => s.kind);
    expect(kinds).toEqual(["text", "flush", "card", "flush", "text"]);
  });

  it("holds back partial <br tails across chunk boundaries", () => {
    // Splits the marker across chunks at every internal byte to verify the
    // parser never leaks a partial sentinel as user-visible text.
    const variants = ["<br>", "<br />", "<br/>"];
    for (const marker of variants) {
      for (let split = 1; split < marker.length; split++) {
        const a = `prose-a${marker.slice(0, split)}`;
        const b = `${marker.slice(split)}prose-b`;
        const segments = drainStreamed([a, b]);
        expect(segments).toEqual([
          { kind: "text", text: "prose-a" },
          { kind: "flush" },
          { kind: "text", text: "prose-b" },
        ]);
      }
    }
  });

  it("holds back partial <card tails the same way (regression)", () => {
    const segments = drainStreamed([
      "before<ca",
      'rd>{"type":"card","title":null,"subtitle":null,"children":[{"type":"row","text":"x","accessory":null,"context":null}]}</card>after',
    ]);
    const kinds = segments.map((s) => s.kind);
    expect(kinds).toEqual(["text", "card", "text"]);
    expect((segments[0] as { kind: "text"; text: string }).text).toBe("before");
    expect((segments[2] as { kind: "text"; text: string }).text).toBe("after");
  });

  it("does not treat <book> or other <b... text as a flush", () => {
    const segments = drainAll("the <book> reference and <bro> too");
    expect(segments).toEqual([
      { kind: "text", text: "the <book> reference and <bro> too" },
    ]);
  });

  it("treats a literal trailing < as text on stream end", () => {
    // The parser may split "dangling <" into two text segments (the held-back
    // partial sentinel emits separately during flushTail), but no flush
    // segment fires and the concatenated user-visible text is preserved.
    const segments = drainAll("dangling <");
    expect(segments.every((s) => s.kind === "text")).toBe(true);
    const joined = segments
      .map((s) => (s.kind === "text" ? s.text : ""))
      .join("");
    expect(joined).toBe("dangling <");
  });
});
