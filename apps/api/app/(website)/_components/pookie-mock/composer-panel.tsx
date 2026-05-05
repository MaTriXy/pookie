"use client";

import {
  $isLinkNode,
  formatUrl,
  LinkNode,
  TOGGLE_LINK_COMMAND,
} from "@lexical/link";
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $createQuoteNode, $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $findMatchingParent } from "@lexical/utils";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ENTER_COMMAND,
  type EditorThemeClasses,
  type LexicalEditor,
} from "lexical";

import {
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { composerShadow, cx } from "./styles";

const SEND_CONFIRMATION_MS = 1200;

type BlockType = "paragraph" | "ul" | "ol" | "quote";

interface ComposerIcon {
  label: string;
  path: string;
}

interface ToolbarState {
  isEmpty: boolean;
  formats: Set<string>;
  blockType: BlockType;
}

const FORMAT_ICONS: Array<ComposerIcon | "divider"> = [
  {
    label: "Bold",
    path: "M4 2.75A.75.75 0 0 1 4.75 2h6.343a3.91 3.91 0 0 1 3.88 3.449A3.9 3.9 0 0 1 13.45 9.025 4.627 4.627 0 0 1 11.875 18H4.75a.75.75 0 0 1-.75-.75V2.75Zm2.5 5.565h3.593a2.157 2.157 0 1 0 0-4.315H6.5v4.315Zm4.25 1.935H6.5v5.5h4.25a2.75 2.75 0 1 0 0-5.5Z",
  },
  {
    label: "Italic",
    path: "M7 2.75A.75.75 0 0 1 7.75 2h7.5a.75.75 0 0 1 0 1.5H12.3l-2.6 13h2.55a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5H7.7l2.6-13H7.75A.75.75 0 0 1 7 2.75Z",
  },
  {
    label: "Underline",
    path: "M17.25 17.12a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5h14.5ZM14.5 1.63a.75.75 0 0 1 .75.75v8a5.25 5.25 0 1 1-10.5 0v-8a.75.75 0 0 1 1.5 0v8a3.75 3.75 0 0 0 7.5 0v-8a.75.75 0 0 1 .75-.75Z",
  },
  {
    label: "Strikethrough",
    path: "M11.721 3.84c-.91-.334-2.028-.36-3.035-.114-1.51.407-2.379 1.861-2.164 3.15C6.718 8.051 7.939 9.5 11.5 9.5h5.75a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5h3.66c-.76-.649-1.216-1.468-1.368-2.377-.347-2.084 1.033-4.253 3.265-4.848 1.252-.307 2.68-.292 3.915.16 1.252.457 2.337 1.381 2.738 2.874a.75.75 0 0 1-1.448.39c-.25-.925-.91-1.528-1.805-1.856Zm2.968 9.114a.75.75 0 1 0-1.378.59c.273.64.186 1.205-.13 1.674-.333.492-.958.925-1.82 1.137-.989.243-1.991.165-3.029-.124-.93-.26-1.613-.935-1.858-1.845a.75.75 0 0 0-1.448.39c.388 1.441 1.483 2.503 2.903 2.9 1.213.338 2.486.456 3.79.135 1.14-.28 2.12-.889 2.704-1.753.6-.888.743-1.992.266-3.104Z",
  },
  "divider",
  {
    label: "Link",
    path: "M12.306 3.756a2.75 2.75 0 0 1 3.889 0l.05.05a2.75 2.75 0 0 1 0 3.889l-3.18 3.18a2.75 2.75 0 0 1-3.98-.095l-.03-.034a.75.75 0 0 0-1.11 1.009l.03.034a4.25 4.25 0 0 0 6.15.146l3.18-3.18a4.25 4.25 0 0 0 0-6.01l-.05-.05a4.25 4.25 0 0 0-6.01 0L9.47 4.47a.75.75 0 1 0 1.06 1.06l1.775-1.775ZM7.695 16.246a2.75 2.75 0 0 1-3.89 0l-.05-.051a2.75 2.75 0 0 1 0-3.89l3.18-3.179a2.75 2.75 0 0 1 3.98.095l.03.034a.75.75 0 1 0 1.11-1.01l-.03-.033a4.25 4.25 0 0 0-6.15-.146l-3.18 3.18a4.25 4.25 0 0 0 0 6.01l.05.05a4.25 4.25 0 0 0 6.01 0l1.775-1.775a.75.75 0 0 0-1.06-1.06l-1.775 1.775Z",
  },
  {
    label: "Numbered list",
    path: "M3.792 2.094A.5.5 0 0 1 4 2.5V6h1a.5.5 0 1 1 0 1H2a.5.5 0 1 1 0-1h1V3.194l-.842.28a.5.5 0 0 1-.316-.948l1.5-.5a.5.5 0 0 1 .45.068ZM7.75 3.5a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5h-10ZM7 10.75a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75Zm0 6.5a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10a.75.75 0 0 1-.75-.75Z",
  },
  {
    label: "Bulleted list",
    path: "M4 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm3 0a.75.75 0 0 1 .75-.75h10a.75.75 0 0 1 0 1.5h-10A.75.75 0 0 1 7 3Zm.75 6.25a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5h-10Zm0 7a.75.75 0 0 0 0 1.5h10a.75.75 0 0 0 0-1.5h-10ZM3 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  },
  "divider",
  {
    label: "Block quote",
    path: "M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0V2.75ZM6.75 3a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5ZM6 10.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75Zm.75 5.25a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5Z",
  },
  {
    label: "Code",
    path: "M12.058 3.212c.396.12.62.54.5.936L8.87 16.29a.75.75 0 1 1-1.435-.436l3.686-12.143a.75.75 0 0 1 .936-.5ZM5.472 6.24a.75.75 0 0 1 .005 1.06l-2.67 2.693 2.67 2.691a.75.75 0 1 1-1.065 1.057l-3.194-3.22a.75.75 0 0 1 0-1.056l3.194-3.22a.75.75 0 0 1 1.06-.005Zm9.044 1.06a.75.75 0 1 1 1.065-1.056l3.194 3.221a.75.75 0 0 1 0 1.057l-3.194 3.219a.75.75 0 0 1-1.065-1.057l2.67-2.69-2.67-2.693Z",
  },
];

const SEND_ICON: ComposerIcon = {
  label: "Send",
  path: "M1.5 2.106c0-.462.498-.754.901-.528l15.7 7.714a.73.73 0 0 1 .006 1.307L2.501 18.46a.754.754 0 0 1-1.001-.716v-4.572c0-1.22.971-2.246 2.213-2.268l6.547-.17c.27-.01.75-.243.75-.797 0-.553-.5-.795-.75-.795l-6.547-.171C2.47 8.95 1.5 7.924 1.5 6.704V2.106Z",
};

const editorTheme: EditorThemeClasses = {
  paragraph: "m-0",
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    underlineStrikethrough: "underline line-through",
    code: "rounded bg-[rgb(29_28_29_/_0.06)] px-[3px] py-px font-mono text-[15px] text-[#e01e5a]",
  },
  list: {
    ul: "m-0 list-disc pl-6",
    ol: "m-0 list-decimal pl-6",
    listitem: "ml-1",
    nested: { listitem: "list-none" },
  },
  quote: "my-1 border-l-4 border-[#bbbbbf] pl-3 text-[#454447]",
  link: "cursor-pointer text-[#1264a3] underline",
};

const composerIconButtonClassName = (isActive: boolean) =>
  cx(
    "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border-0 p-0.5 transition-colors",
    isActive
      ? "bg-[rgb(29_28_29_/_0.13)] text-[rgb(29_28_29)]"
      : "bg-transparent text-[rgb(29_28_29_/_0.7)] hover:bg-[rgb(29_28_29_/_0.06)]",
  );

const ComposerIconSvg = ({ path }: { path: string }) => (
  <svg
    aria-hidden="true"
    className="h-[18px] w-[18px] shrink-0"
    viewBox="0 0 20 20"
  >
    <path clipRule="evenodd" d={path} fill="currentColor" fillRule="evenodd" />
  </svg>
);

const ComposerIconButton = ({
  icon,
  isActive = false,
  onClick,
  ref,
  ariaHasPopup,
  ariaExpanded,
}: {
  icon: ComposerIcon;
  isActive?: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLButtonElement>;
  ariaHasPopup?: "dialog" | "menu";
  ariaExpanded?: boolean;
}) => (
  <button
    ref={ref}
    aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
    aria-haspopup={ariaHasPopup}
    aria-label={icon.label}
    aria-pressed={ariaHasPopup ? undefined : isActive}
    className={composerIconButtonClassName(isActive)}
    onClick={onClick}
    type="button"
  >
    <ComposerIconSvg path={icon.path} />
  </button>
);

const ComposerDivider = () => (
  <span
    aria-hidden="true"
    className="mx-1.5 my-0.5 h-5 w-px shrink-0 bg-[rgb(29_28_29_/_0.13)]"
  />
);

const promptForLinkUrl = () => {
  const promptValue = window.prompt("Enter URL", "https://");
  if (promptValue === null) return null;
  const trimmed = promptValue.trim();
  if (trimmed.length === 0) return null;
  return formatUrl(trimmed);
};

const dispatchFormatAction = (
  editor: LexicalEditor,
  label: string,
  toolbarState: ToolbarState,
) => {
  switch (label) {
    case "Bold":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
      return;
    case "Italic":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
      return;
    case "Underline":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
      return;
    case "Strikethrough":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
      return;
    case "Code":
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
      return;
    case "Link": {
      if (toolbarState.formats.has("Link")) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        return;
      }
      const url = promptForLinkUrl();
      if (url === null) return;
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      return;
    }
    case "Numbered list":
      if (toolbarState.blockType === "ol") {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
      }
      return;
    case "Bulleted list":
      if (toolbarState.blockType === "ul") {
        editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      } else {
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
      }
      return;
    case "Block quote":
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        if (toolbarState.blockType === "quote") {
          $setBlocksType(selection, () => $createParagraphNode());
        } else {
          $setBlocksType(selection, () => $createQuoteNode());
        }
      });
      return;
    default:
      return;
  }
};

const isFormatActive = (label: string, toolbarState: ToolbarState) => {
  if (label === "Numbered list") return toolbarState.blockType === "ol";
  if (label === "Bulleted list") return toolbarState.blockType === "ul";
  if (label === "Block quote") return toolbarState.blockType === "quote";
  return toolbarState.formats.has(label);
};

const FormattingToolbar = ({
  toolbarState,
}: {
  toolbarState: ToolbarState;
}) => {
  const [editor] = useLexicalComposerContext();
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-2 pl-1.5">
      {FORMAT_ICONS.map((icon, index) =>
        icon === "divider" ? (
          <ComposerDivider key={`divider-${index}`} />
        ) : (
          <ComposerIconButton
            icon={icon}
            isActive={isFormatActive(icon.label, toolbarState)}
            key={icon.label}
            onClick={() =>
              dispatchFormatAction(editor, icon.label, toolbarState)
            }
          />
        ),
      )}
    </div>
  );
};

const ToolbarStatePlugin = ({
  onChange,
}: {
  onChange: (state: ToolbarState) => void;
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot();
        const isEmpty = root.getTextContent().trim().length === 0;

        const formats = new Set<string>();
        let blockType: BlockType = "paragraph";

        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          if (selection.hasFormat("bold")) formats.add("Bold");
          if (selection.hasFormat("italic")) formats.add("Italic");
          if (selection.hasFormat("underline")) formats.add("Underline");
          if (selection.hasFormat("strikethrough"))
            formats.add("Strikethrough");
          if (selection.hasFormat("code")) formats.add("Code");

          const anchorNode = selection.anchor.getNode();
          if ($findMatchingParent(anchorNode, $isLinkNode) !== null) {
            formats.add("Link");
          }

          const topElement =
            anchorNode.getKey() === "root"
              ? anchorNode
              : anchorNode.getTopLevelElementOrThrow();

          if ($isListNode(topElement)) {
            blockType = topElement.getListType() === "number" ? "ol" : "ul";
          } else if ($isQuoteNode(topElement)) {
            blockType = "quote";
          }
        }

        onChange({ isEmpty, formats, blockType });
      });
    });
  }, [editor, onChange]);

  return null;
};

const SendOnEnterPlugin = ({ onSend }: { onSend: () => void }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event === null || event.shiftKey) return false;

        const isUniversalSend = event.metaKey || event.ctrlKey;
        if (!isUniversalSend) {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            const anchorNode = selection.anchor.getNode();
            const topElement =
              anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            if ($isListNode(topElement) || $isQuoteNode(topElement)) {
              return false;
            }
          }
        }

        event.preventDefault();
        onSend();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSend]);

  return null;
};

const BottomToolbar = ({
  onSend,
  canSend,
}: {
  onSend: () => void;
  canSend: boolean;
}) => (
  <div className="flex h-10 shrink-0 items-center justify-end">
    <div className="flex items-center">
      <button
        aria-disabled={!canSend}
        aria-label={canSend ? "Send" : "Send (type a message first)"}
        className={cx(
          "inline-flex h-7 w-8 shrink-0 items-center justify-center rounded border-0 p-0.5 transition-colors",
          canSend
            ? "cursor-pointer bg-[#007a5a] text-white hover:bg-[#005e45]"
            : "cursor-not-allowed bg-transparent text-[rgb(29_28_29_/_0.3)]",
        )}
        onClick={canSend ? onSend : undefined}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-[18px] w-[18px] shrink-0"
          viewBox="0 0 20 20"
        >
          <path
            clipRule="evenodd"
            d={SEND_ICON.path}
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      </button>
    </div>
  </div>
);

const ComposerInner = () => {
  const [editor] = useLexicalComposerContext();
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    isEmpty: true,
    formats: new Set(),
    blockType: "paragraph",
  });
  const [didJustSend, setDidJustSend] = useState(false);
  const sendConfirmationTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (sendConfirmationTimeoutRef.current !== null) {
        window.clearTimeout(sendConfirmationTimeoutRef.current);
      }
    };
  }, []);

  const canSend = !toolbarState.isEmpty;

  const sendMessage = useCallback(() => {
    let hasContent = false;
    editor.getEditorState().read(() => {
      hasContent = $getRoot().getTextContent().trim().length > 0;
    });
    if (!hasContent) return;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode());
    });
    setDidJustSend(true);
    if (sendConfirmationTimeoutRef.current !== null) {
      window.clearTimeout(sendConfirmationTimeoutRef.current);
    }
    sendConfirmationTimeoutRef.current = window.setTimeout(() => {
      setDidJustSend(false);
      sendConfirmationTimeoutRef.current = null;
    }, SEND_CONFIRMATION_MS);
  }, [editor]);

  return (
    <>
      <FormattingToolbar toolbarState={toolbarState} />
      <div className="relative flex min-h-[58px] shrink-0 flex-col justify-center pl-[11px]">
        <RichTextPlugin
          ErrorBoundary={LexicalErrorBoundary}
          contentEditable={
            <ContentEditable
              aria-label="Message #pookie"
              aria-placeholder={
                didJustSend ? "Message sent" : "Message #pookie"
              }
              className="w-full border-0 bg-transparent p-0 text-[17px] leading-[22px] font-medium text-[#1d1c1d] outline-none [&_*]:outline-none"
              placeholder={
                <div className="pointer-events-none absolute top-[18px] left-[11px] text-[17px] leading-[22px] font-medium text-[#4d4d4d] select-none">
                  {didJustSend ? "Message sent" : "Message #pookie"}
                </div>
              }
            />
          }
        />
      </div>
      <BottomToolbar
        canSend={canSend}
        onSend={sendMessage}
      />
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <ToolbarStatePlugin onChange={setToolbarState} />
      <SendOnEnterPlugin onSend={sendMessage} />
    </>
  );
};

export const ComposerPanel = () => (
  <div
    className={cx(
      composerShadow,
      "flex w-[720px] max-w-full shrink-0 flex-col rounded-[14px] bg-white pt-3 pr-1.5 pb-1.5 pl-1.5 focus-within:[box-shadow:#1264a3_0px_0px_0px_1.5px,#00000008_0px_2px_24px,#00000003_0px_4px_4px,#00000003_0px_2px_2px]",
    )}
  >
    <LexicalComposer
      initialConfig={{
        namespace: "pookie-composer",
        theme: editorTheme,
        nodes: [QuoteNode, ListNode, ListItemNode, LinkNode],
        onError: (error) => {
          console.error("Lexical error:", error);
        },
      }}
    >
      <ComposerInner />
    </LexicalComposer>
  </div>
);
