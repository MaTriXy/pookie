import { sanitizeForCardMrkdwn } from "../utils/sanitize-slack-mrkdwn";

import type {
  ActionsBlock,
  Button,
  ContextBlock,
  DividerBlock,
  HeaderBlock,
  ImageBlock,
  ImageElement,
  KnownBlock,
  MrkdwnElement,
  SectionBlock,
} from "@slack/types";

import type {
  AgentCard,
  AgentCardChild,
  AgentSectionChild,
} from "./response-schema";

const assertExhaustive = (value: never): never => {
  throw new Error(
    `unhandled card child variant: ${JSON.stringify(value satisfies never)}`,
  );
};

const slackButtonStyle = (
  style: "primary" | "danger" | "default" | null | undefined,
): "primary" | "danger" | undefined => {
  if (style === "primary" || style === "danger") return style;
  return undefined;
};

const renderLinkButton = (button: {
  label: string;
  url: string;
  style?: "primary" | "danger" | "default" | null;
}): Button => {
  const element: Button = {
    type: "button",
    text: { type: "plain_text", text: button.label, emoji: true },
    action_id: `link-${button.url.slice(0, 200)}`,
    url: button.url,
  };
  const mappedStyle = slackButtonStyle(button.style);
  if (mappedStyle) element.style = mappedStyle;
  return element;
};

const mrkdwn = (text: string): MrkdwnElement => ({
  type: "mrkdwn",
  text: sanitizeForCardMrkdwn(text),
});

const renderTextElement = (element: {
  content: string;
  style?: "plain" | "bold" | "muted" | null;
}): SectionBlock | ContextBlock => {
  if (element.style === "muted") {
    return { type: "context", elements: [mrkdwn(element.content)] };
  }
  const text =
    element.style === "bold" ? `*${element.content}*` : element.content;
  return { type: "section", text: mrkdwn(text) };
};

const renderLinkAsSection = (link: {
  label: string;
  url: string;
}): SectionBlock => ({
  type: "section",
  text: mrkdwn(`<${link.url}|${link.label}>`),
});

const renderFieldsBlock = (fields: {
  children: { label: string; value: string }[];
}): SectionBlock => ({
  type: "section",
  fields: fields.children.map((entry) =>
    mrkdwn(`*${entry.label}*\n${entry.value}`),
  ),
});

const renderSectionChild = (child: AgentSectionChild): KnownBlock[] => {
  switch (child.type) {
    case "text":
      return [renderTextElement(child)];
    case "divider":
      return [{ type: "divider" }];
    case "link":
      return [renderLinkAsSection(child)];
    case "fields":
      return [renderFieldsBlock(child)];
    default:
      return assertExhaustive(child);
  }
};

const renderTableBlocks = (table: {
  headers: string[];
  rows: string[][];
}): SectionBlock[] => {
  const headerRow = `| ${table.headers.join(" | ")} |`;
  const separatorRow = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const dataRows = table.rows.map((row) => `| ${row.join(" | ")} |`);
  const formatted = ["```", headerRow, separatorRow, ...dataRows, "```"].join(
    "\n",
  );
  return [{ type: "section", text: mrkdwn(formatted) }];
};

type RowAccessoryInput =
  | {
      type: "link-button";
      label: string;
      url: string;
      style?: "primary" | "danger" | "default" | null;
    }
  | {
      type: "image";
      url: string;
      altText: string;
    };

const renderImageAccessory = (accessory: {
  url: string;
  altText: string;
}): ImageElement => ({
  type: "image",
  image_url: accessory.url,
  alt_text: accessory.altText,
});

const renderRowBlocks = (row: {
  text: string;
  accessory?: RowAccessoryInput | null;
  context?: string | null;
}): KnownBlock[] => {
  const sectionBlock: SectionBlock = {
    type: "section",
    text: mrkdwn(row.text),
  };

  if (row.accessory) {
    if (row.accessory.type === "link-button") {
      sectionBlock.accessory = renderLinkButton({
        label: row.accessory.label,
        url: row.accessory.url,
        style: row.accessory.style,
      });
    } else {
      sectionBlock.accessory = renderImageAccessory({
        url: row.accessory.url,
        altText: row.accessory.altText,
      });
    }
  }

  const blocks: KnownBlock[] = [sectionBlock];
  if (row.context) {
    blocks.push({
      type: "context",
      elements: [mrkdwn(row.context)],
    });
  }
  return blocks;
};

const renderActionsBlock = (actions: {
  children: {
    label: string;
    url: string;
    style?: "primary" | "danger" | "default" | null;
  }[];
}): ActionsBlock => ({
  type: "actions",
  elements: actions.children.map(renderLinkButton),
});

const renderImageBlock = (image: {
  url: string;
  altText: string;
  title?: string | null;
}): ImageBlock => {
  const block: ImageBlock = {
    type: "image",
    image_url: image.url,
    alt_text: image.altText,
  };
  if (image.title) {
    block.title = { type: "plain_text", text: image.title, emoji: true };
  }
  return block;
};

const renderHeaderBlock = (header: { text: string }): HeaderBlock => ({
  type: "header",
  text: { type: "plain_text", text: header.text, emoji: true },
});

// Slack has no native quote block. We render the body as a section prefixed
// with `>` mrkdwn (the visible vertical-bar quote style) and append a muted
// context block for the author/timestamp when provided.
const renderQuoteBlocks = (quote: {
  text: string;
  author?: string | null;
  timestamp?: string | null;
}): KnownBlock[] => {
  const quoted = quote.text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const blocks: KnownBlock[] = [{ type: "section", text: mrkdwn(quoted) }];
  if (quote.author || quote.timestamp) {
    const attribution = [
      quote.author ? `*${quote.author}*` : null,
      quote.timestamp,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    blocks.push({ type: "context", elements: [mrkdwn(`— ${attribution}`)] });
  }
  return blocks;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const renderFileBlocks = (file: {
  name: string;
  url: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}): KnownBlock[] => {
  const meta = [
    file.mimeType,
    file.sizeBytes != null ? formatFileSize(file.sizeBytes) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  // Don't bold-wrap the <url|label> mrkdwn entity — Slack's parser breaks
  // when * brackets a link and the link renders as literal angle-bracket
  // text. Apply visual emphasis with the 📎 prefix and a context line below
  // instead of trying to bold the link itself.
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: mrkdwn(`📎 <${file.url}|${file.name}>`),
    },
  ];
  if (meta) {
    blocks.push({ type: "context", elements: [mrkdwn(meta)] });
  }
  return blocks;
};

const renderCodeBlocks = (code: {
  language?: string | null;
  content: string;
  fileName?: string | null;
}): KnownBlock[] => {
  const blocks: KnownBlock[] = [];
  if (code.fileName || code.language) {
    const label = code.fileName
      ? code.language
        ? `\`${code.fileName}\` · ${code.language}`
        : `\`${code.fileName}\``
      : code.language;
    if (label) {
      blocks.push({ type: "context", elements: [mrkdwn(label)] });
    }
  }
  blocks.push({
    type: "section",
    text: mrkdwn("```\n" + code.content + "\n```"),
  });
  return blocks;
};

const renderChild = (child: AgentCardChild): KnownBlock[] => {
  switch (child.type) {
    case "text":
      return [renderTextElement(child)];
    case "divider": {
      const block: DividerBlock = { type: "divider" };
      return [block];
    }
    case "link":
      return [renderLinkAsSection(child)];
    case "fields":
      return [renderFieldsBlock(child)];
    case "section":
      return child.children.flatMap(renderSectionChild);
    case "actions":
      return [renderActionsBlock(child)];
    case "table":
      return renderTableBlocks(child);
    case "row":
      return renderRowBlocks(child);
    case "image-block":
      return [renderImageBlock(child)];
    case "header":
      return [renderHeaderBlock(child)];
    case "quote":
      return renderQuoteBlocks(child);
    case "file":
      return renderFileBlocks(child);
    case "code":
      return renderCodeBlocks(child);
    default:
      return assertExhaustive(child);
  }
};

// `bodyBlocks` go either top-level or inside an attachment depending on
// `frame`. `footerBlocks` always go top-level so a `footerAction` button
// renders below any framed body.
export interface RenderedCard {
  bodyBlocks: KnownBlock[];
  footerBlocks: KnownBlock[];
  frame: "attachment" | null;
}

export const renderCardAsBlocks = (card: AgentCard): RenderedCard => {
  const bodyBlocks: KnownBlock[] = [];

  if (card.title) {
    const headerBlock: HeaderBlock = {
      type: "header",
      text: { type: "plain_text", text: card.title, emoji: true },
    };
    bodyBlocks.push(headerBlock);
  }
  if (card.subtitle) {
    const contextBlock: ContextBlock = {
      type: "context",
      elements: [mrkdwn(card.subtitle)],
    };
    bodyBlocks.push(contextBlock);
  }

  for (const child of card.children) {
    bodyBlocks.push(...renderChild(child));
  }

  const footerBlocks: KnownBlock[] = [];
  if (card.footerAction) {
    footerBlocks.push({
      type: "actions",
      elements: [renderLinkButton({ ...card.footerAction, style: "primary" })],
    });
  }

  return { bodyBlocks, footerBlocks, frame: card.frame ?? null };
};
