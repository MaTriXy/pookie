"use client";

import type { ReactNode } from "react";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cx } from "./styles";

const SCROLL_EDGE_EPSILON_PX = 1;

export const ScrollFadeViewport = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const [fadeVisibility, setFadeVisibility] = useState({
    top: false,
    bottom: false,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const updateFadeVisibility = useCallback(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    const maxScrollTop = element.scrollHeight - element.clientHeight;
    const nextVisibility = {
      top: element.scrollTop > SCROLL_EDGE_EPSILON_PX,
      bottom: maxScrollTop - element.scrollTop > SCROLL_EDGE_EPSILON_PX,
    };

    setFadeVisibility((currentVisibility) =>
      currentVisibility.top === nextVisibility.top &&
      currentVisibility.bottom === nextVisibility.bottom
        ? currentVisibility
        : nextVisibility,
    );
  }, []);

  useLayoutEffect(() => {
    updateFadeVisibility();
  }, [children, updateFadeVisibility]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element) return;

    updateFadeVisibility();

    const resizeObserver = new ResizeObserver(updateFadeVisibility);
    resizeObserver.observe(element);
    Array.from(element.children).forEach((child) => {
      resizeObserver.observe(child);
    });

    return () => resizeObserver.disconnect();
  }, [children, updateFadeVisibility]);

  return (
    <div className="relative min-h-0 flex-1">
      {fadeVisibility.top && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-white to-white/0"
        />
      )}
      {fadeVisibility.bottom && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-white to-white/0"
        />
      )}

      <div
        ref={scrollContainerRef}
        onScroll={updateFadeVisibility}
        className={cx(
          "h-full min-h-0 overflow-x-hidden overflow-y-auto [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
};
