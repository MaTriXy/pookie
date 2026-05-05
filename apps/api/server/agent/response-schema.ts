import { z } from "zod";

import {
  CARD_BUTTON_LABEL_MAX_CHARS,
  CARD_CODE_CONTENT_MAX_CHARS,
  CARD_CODE_FILENAME_MAX_CHARS,
  CARD_CODE_LANGUAGE_MAX_CHARS,
  CARD_FIELD_LABEL_MAX_CHARS,
  CARD_FIELD_VALUE_MAX_CHARS,
  CARD_FILE_MIME_MAX_CHARS,
  CARD_FILE_NAME_MAX_CHARS,
  CARD_HEADER_MAX_CHARS,
  CARD_LINK_LABEL_MAX_CHARS,
  CARD_QUOTE_AUTHOR_MAX_CHARS,
  CARD_QUOTE_TIMESTAMP_MAX_CHARS,
  CARD_SUBTITLE_MAX_CHARS,
  CARD_TABLE_CELL_MAX_CHARS,
  CARD_TEXT_MAX_CHARS,
  CARD_TITLE_MAX_CHARS,
} from "./constants";

const textStyleSchema = z.enum(["plain", "bold", "muted"]);
const buttonStyleSchema = z.enum(["primary", "danger", "default"]);
const tableAlignmentSchema = z.enum(["left", "center", "right"]);

// Avoid `z.string().url()` — it emits `format: "uri"` which OpenAI structured
// outputs strict mode rejects (only date-time/time/date/duration/email/hostname/
// ipv4/ipv6/uuid are accepted). We validate runtime-only via the URL constructor.
const safeUrlSchema = z
  .string()
  .min(1)
  .refine((raw) => {
    if (!/^https?:\/\//i.test(raw)) return false;
    try {
      new URL(raw);
      return true;
    } catch {
      return false;
    }
  }, "URL must be a valid http(s) URL");

// `.nullable().optional()` everywhere we'd otherwise have `.nullable()`:
// the model frequently omits "empty" fields entirely instead of writing
// them as `null`. Schema strictness silently drops the whole card when
// validation fails (see parse-card-stream + agent/index `dropping malformed
// <card> block`), which the user sees as "my response had no card." Allowing
// either omitted OR null for every nullable field keeps the renderer happy
// (it already truthy-checks every nullable field) while making the schema
// resilient to model drift. The `frame`/`footerAction` precedent on the
// outer card established this pattern; we now apply it uniformly.
const textElementSchema = z.object({
  type: z.literal("text"),
  content: z
    .string()
    .min(1)
    .max(CARD_TEXT_MAX_CHARS)
    .describe(
      "Text content. May contain Slack mrkdwn (*bold*, _italic_, `code`, <url|label>).",
    ),
  style: textStyleSchema.nullable().optional(),
});

const dividerElementSchema = z.object({
  type: z.literal("divider"),
});

const linkElementSchema = z.object({
  type: z.literal("link"),
  label: z.string().min(1).max(CARD_LINK_LABEL_MAX_CHARS),
  url: safeUrlSchema,
});

const fieldEntrySchema = z.object({
  type: z.literal("field"),
  label: z.string().min(1).max(CARD_FIELD_LABEL_MAX_CHARS),
  value: z.string().max(CARD_FIELD_VALUE_MAX_CHARS),
});

const fieldsElementSchema = z.object({
  type: z.literal("fields"),
  children: z.array(fieldEntrySchema).min(1).max(10),
});

const linkButtonElementSchema = z.object({
  type: z.literal("link-button"),
  label: z.string().min(1).max(CARD_BUTTON_LABEL_MAX_CHARS),
  url: safeUrlSchema,
  style: buttonStyleSchema.nullable().optional(),
});

const actionsElementSchema = z.object({
  type: z.literal("actions"),
  children: z
    .array(linkButtonElementSchema)
    .min(1)
    .max(5)
    .describe("Read-only link buttons that open URLs. No interactive buttons."),
});

const tableCellSchema = z.string().max(CARD_TABLE_CELL_MAX_CHARS);

const tableElementSchema = z
  .object({
    type: z.literal("table"),
    headers: z
      .array(z.string().min(1).max(CARD_TABLE_CELL_MAX_CHARS))
      .min(1)
      .max(6),
    rows: z.array(z.array(tableCellSchema).min(1).max(6)).min(1).max(20),
    align: z.array(tableAlignmentSchema).nullable().optional(),
  })
  .refine(
    (table) => table.rows.every((row) => row.length === table.headers.length),
    "Every row must have the same number of cells as headers",
  )
  .refine(
    (table) => !table.align || table.align.length === table.headers.length,
    "align (when set) must have one entry per header column",
  );

// OpenAI structured outputs strict mode rejects `oneOf` (which `z.discriminatedUnion`
// compiles to). `z.union` produces `anyOf`, which strict mode accepts. Functionally
// equivalent here since every variant carries a literal `type` field for runtime
// narrowing.
const sectionChildSchema = z.union([
  textElementSchema,
  dividerElementSchema,
  linkElementSchema,
  fieldsElementSchema,
]);

const sectionElementSchema = z.object({
  type: z.literal("section"),
  children: z.array(sectionChildSchema).min(1).max(20),
});

// A "row" is a single visual unit: mrkdwn text on the left, an optional
// accessory (image or link-button) on the right, and an optional muted
// context footer below — the Block Kit Section + accessory + Context
// pattern. Use this for search hits, channel results, hotel/file/event
// previews, and anything where each item should feel like its own unit.
const rowLinkButtonAccessorySchema = z.object({
  type: z.literal("link-button"),
  label: z.string().min(1).max(CARD_BUTTON_LABEL_MAX_CHARS),
  url: safeUrlSchema,
  style: buttonStyleSchema.nullable().optional(),
});

const rowImageAccessorySchema = z.object({
  type: z.literal("image"),
  url: safeUrlSchema.describe(
    "Public https image URL. Slack must be able to fetch this without auth.",
  ),
  altText: z.string().min(1).max(200),
});

const rowAccessorySchema = z.union([
  rowLinkButtonAccessorySchema,
  rowImageAccessorySchema,
]);

const rowElementSchema = z.object({
  type: z.literal("row"),
  text: z
    .string()
    .min(1)
    .max(CARD_TEXT_MAX_CHARS)
    .describe(
      "Slack mrkdwn shown on the left side of the row. Use *<url|Title>* for the primary clickable label and put metadata (price, rating, snippet, summary) on subsequent lines. Prefer inline `<url|label>` mrkdwn for ALL link references inside row.text — buttons should be reserved for true picker/decision UX.",
    ),
  accessory: rowAccessorySchema
    .nullable()
    .optional()
    .describe(
      "Optional accessory shown on the right side of the row. Use `image` for visual previews (hotel/file/event thumbnails). Use `link-button` ONLY for true picker/decision UX (calendar-conflict 'Choose this time' rows) — for ordinary link handoffs (open thread, view file), inline the link via Slack mrkdwn `<url|label>` in row.text instead.",
    ),
  context: z
    .string()
    .min(1)
    .max(CARD_TEXT_MAX_CHARS)
    .nullable()
    .optional()
    .describe(
      "Optional muted footer line shown below the row text (e.g. '📍 Location: French Quarter', '⏱ sent 2h ago', '🔗 github.com/foo/bar'). Renders as a Slack context block.",
    ),
});

// Top-level image: full-width hero/preview image inside a card, distinct from
// row.accessory (which is a thumbnail on the right of a row).
const imageBlockElementSchema = z.object({
  type: z.literal("image-block"),
  url: safeUrlSchema.describe(
    "Public https image URL. Slack must be able to fetch this without auth.",
  ),
  altText: z.string().min(1).max(200),
  title: z.string().min(1).max(150).nullable().optional(),
});

// Sub-section header inside a card. Renders as a Block Kit `header` block —
// big bold text. Useful for grouping rows ("Today" / "This Week" / "Older").
const headerElementSchema = z.object({
  type: z.literal("header"),
  text: z.string().min(1).max(CARD_HEADER_MAX_CHARS),
});

// Block-quote rendering: prefixed with Slack's `>` mrkdwn for the visual bar.
// Author and timestamp render as a muted context footer below the quote.
const quoteElementSchema = z.object({
  type: z.literal("quote"),
  text: z
    .string()
    .min(1)
    .max(CARD_TEXT_MAX_CHARS)
    .describe(
      "The quoted content. Mrkdwn-aware. Don't include the leading `>` — the renderer adds it.",
    ),
  author: z
    .string()
    .min(1)
    .max(CARD_QUOTE_AUTHOR_MAX_CHARS)
    .nullable()
    .optional(),
  timestamp: z
    .string()
    .min(1)
    .max(CARD_QUOTE_TIMESTAMP_MAX_CHARS)
    .nullable()
    .optional(),
});

// File reference: rendered as a section with file metadata + an inline link to
// open. Slack's native `file` block requires a slack-hosted file_id, which we
// don't always have, so we render via mrkdwn instead — works for any URL.
const fileElementSchema = z.object({
  type: z.literal("file"),
  name: z.string().min(1).max(CARD_FILE_NAME_MAX_CHARS),
  url: safeUrlSchema.describe(
    "URL to open the file (slack permalink, drive URL, github URL, etc.).",
  ),
  mimeType: z
    .string()
    .min(1)
    .max(CARD_FILE_MIME_MAX_CHARS)
    .nullable()
    .optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
});

// Code block: rendered as Slack mrkdwn ``` fenced block. The optional
// `fileName` renders as a small muted prefix above the block. Content is
// capped below the 3000-char Slack section limit to leave room for the fences.
const codeElementSchema = z.object({
  type: z.literal("code"),
  language: z
    .string()
    .min(1)
    .max(CARD_CODE_LANGUAGE_MAX_CHARS)
    .nullable()
    .optional(),
  content: z.string().min(1).max(CARD_CODE_CONTENT_MAX_CHARS),
  fileName: z
    .string()
    .min(1)
    .max(CARD_CODE_FILENAME_MAX_CHARS)
    .nullable()
    .optional(),
});

const cardChildSchema = z.union([
  textElementSchema,
  dividerElementSchema,
  linkElementSchema,
  fieldsElementSchema,
  sectionElementSchema,
  actionsElementSchema,
  tableElementSchema,
  rowElementSchema,
  imageBlockElementSchema,
  headerElementSchema,
  quoteElementSchema,
  fileElementSchema,
  codeElementSchema,
]);

// Distinct from the in-card `actions` block: this CTA is emitted at the
// message root so it renders BELOW a framed attachment, full-width on mobile.
// Always primary because the slot is purpose-built for the "Open in [tool]"
// pattern — destructive footer CTAs make no sense on a status notification.
const cardFooterActionSchema = z.object({
  label: z.string().min(1).max(CARD_BUTTON_LABEL_MAX_CHARS),
  url: safeUrlSchema,
});

// Every nullable field uses `.nullable().optional()`; see the top-of-file
// comment on textElementSchema for the rationale (model omits empty fields,
// schema strictness silently drops cards). `frame` and `footerAction` were
// the original optional fields here for backwards compat with pre-existing
// cached card payloads — they now follow the same uniform pattern.
export const agentCardSchema = z
  .object({
    type: z.literal("card"),
    title: z.string().min(1).max(CARD_TITLE_MAX_CHARS).nullable().optional(),
    subtitle: z
      .string()
      .min(1)
      .max(CARD_SUBTITLE_MAX_CHARS)
      .nullable()
      .optional(),
    children: z.array(cardChildSchema).min(1).max(40),
    frame: z.enum(["attachment"]).nullable().optional(),
    footerAction: cardFooterActionSchema.nullable().optional(),
  })
  .refine(
    (card) => card.children.some((child) => child.type !== "divider"),
    "Card must contain at least one non-divider child",
  );

export type AgentCard = z.infer<typeof agentCardSchema>;
export type AgentCardChild = z.infer<typeof cardChildSchema>;
export type AgentSectionChild = z.infer<typeof sectionChildSchema>;
