import { Card, CardLink, CardText } from "chat";
import prettyMs from "pretty-ms";

import { getCurrentTraceAxiomLink } from "./get-current-trace-id";

import type { CardChild } from "chat";
import type { Thread } from "chat";

export const postTraceFooter = async (
  thread: Thread,
  traceId: string | undefined,
  elapsedMs?: number,
): Promise<void> => {
  if (!traceId) return;
  const durationSuffix =
    typeof elapsedMs === "number" && Number.isFinite(elapsedMs)
      ? ` · ${prettyMs(elapsedMs)}`
      : "";

  const axiomLink = getCurrentTraceAxiomLink();
  const fallbackText = `trace: ${traceId}${durationSuffix}`;

  const children: CardChild[] = axiomLink
    ? [CardLink({ url: axiomLink, label: `trace: ${traceId}` })]
    : [CardText(`trace: ${traceId}`, { style: "muted" })];

  if (durationSuffix) {
    children.push(CardText(durationSuffix, { style: "muted" }));
  }

  await thread.post({
    card: Card({ children }),
    fallbackText,
  });
};
