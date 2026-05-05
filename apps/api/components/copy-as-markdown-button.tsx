"use client";

import { useEffect, useRef, useState } from "react";

import animations from "@/app/(website)/_components/pookie-mock/animations.module.css";
import { BorderedIconButton } from "@/app/(website)/_components/pookie-mock/bordered-icon-button";

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
    <BorderedIconButton
      label={copied ? "Copied as Markdown" : "Copy as Markdown"}
      onClick={handleClick}
      onMouseEnter={loadDefuddle}
      onFocus={loadDefuddle}
      variant="icon"
    >
      <span
        aria-hidden="true"
        className={`${animations.iconSwap} col-start-1 row-start-1 h-[22px] w-[22px] place-self-center text-[#454447]`}
        data-state={copied ? "check" : "copy"}
      >
        <span className={animations.icon} data-icon="copy">
          <svg
            className="h-[22px] w-[22px]"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M9.94155 2C8.65025 2 7.50384 2.82629 7.0955 4.05132L7.05134 4.18377C6.8767 4.70772 7.15986 5.27404 7.6838 5.44868C8.20774 5.62333 8.77406 5.34017 8.94871 4.81623L8.99286 4.68377C9.12898 4.27543 9.51112 4 9.94155 4H19C19.5523 4 20 4.44772 20 5V14.0585C20 14.4889 19.7246 14.8711 19.3163 15.0072L19.1838 15.0513C18.6599 15.226 18.3767 15.7923 18.5513 16.3162C18.726 16.8402 19.2923 17.1233 19.8163 16.9487L19.9487 16.9045C21.1737 16.4962 22 15.3498 22 14.0585V5C22 3.34315 20.6569 2 19 2H9.94155ZM5 7C3.34315 7 2 8.34315 2 10V19C2 20.6569 3.34315 22 5 22H14C15.6569 22 17 20.6569 17 19V10C17 8.34315 15.6569 7 14 7H5ZM4 10C4 9.44772 4.44772 9 5 9H14C14.5523 9 15 9.44772 15 10V19C15 19.5523 14.5523 20 14 20H5C4.44772 20 4 19.5523 4 19V10Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </span>
        <span className={animations.icon} data-icon="check">
          <svg
            className="h-[22px] w-[22px]"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M20.7071 5.29289C21.0976 5.68342 21.0976 6.31658 20.7071 6.70711L9.70711 17.7071C9.31658 18.0976 8.68342 18.0976 8.29289 17.7071L3.29289 12.7071C2.90237 12.3166 2.90237 11.6834 3.29289 11.2929C3.68342 10.9024 4.31658 10.9024 4.70711 11.2929L9 15.5858L19.2929 5.29289C19.6834 4.90237 20.3166 4.90237 20.7071 5.29289Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </span>
      </span>
    </BorderedIconButton>
  );
};
