"use client";

import { CheckIcon, CopyIcon } from "lucide-react";

import { useEffect, useRef, useState } from "react";

const COPIED_RESET_MS = 1500;

const loadDefuddle = () => import("defuddle/full");

export const CopyAsMarkdownButton = () => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    try {
      const { default: Defuddle } = await loadDefuddle();
      const result = new Defuddle(document, {
        markdown: true,
        url: window.location.href,
      }).parse();

      await navigator.clipboard.writeText(result.content ?? "");

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      setCopied(true);
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, COPIED_RESET_MS);
    } catch (error) {
      console.error("Failed to copy as markdown", error);
    }
  };

  return (
    <button
      className="inline-flex h-[33px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#d7d7d7] bg-white px-3 text-[13px] font-medium text-[#666] no-underline transition-colors hover:bg-[#f8f8f8] hover:text-[#393939]"
      onClick={handleClick}
      onMouseEnter={loadDefuddle}
      onFocus={loadDefuddle}
      type="button"
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy as Markdown"}
    </button>
  );
};
