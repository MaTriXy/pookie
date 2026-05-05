import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { isValidElement } from "react";
import type { ReactNode } from "react";

import { slugifyHeading } from "@/lib/docs";

import type { Components } from "react-markdown";

const extractText = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
};

const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-2 mb-6 text-[20px] font-bold leading-[26px] tracking-[-0.03em] text-[#1d1c1d] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => {
    const id = slugifyHeading(extractText(children));
    return (
      <h2
        id={id}
        className="mt-10 mb-4 scroll-mt-12 border-b border-[#f0f0f0] pb-2 text-[17px] font-bold tracking-[-0.03em] text-[#1d1c1d]"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const id = slugifyHeading(extractText(children));
    return (
      <h3
        id={id}
        className="mt-7 mb-3 scroll-mt-12 text-[15px] font-bold tracking-[-0.02em] text-[#1d1c1d]"
      >
        {children}
      </h3>
    );
  },
  p: ({ children }) => (
    <p className="mb-4 text-[15px] leading-[23px] tracking-[-0.01em] text-[#4d4d4d]">
      {children}
    </p>
  ),
  a: ({ href, children }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        className="text-[#006fa8] underline underline-offset-2 hover:no-underline"
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  code: ({ children }) => (
    <code className="rounded bg-[#f0f0f0] px-1.5 py-0.5 font-mono text-[0.875em] text-[#393939]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-[#f7f7f7] p-4 font-mono text-[13px] leading-[20px] text-[#4d4d4d] [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[13px]">
      {children}
    </pre>
  ),
  ul: ({ children }) => (
    <ul className="my-4 ml-5 flex list-disc flex-col gap-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-5 flex list-decimal flex-col gap-1.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[15px] leading-[23px] tracking-[-0.01em] text-[#4d4d4d] [&>p]:mb-0">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-[#e0e0e0] pl-4 text-[#888] italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-[#f0f0f0]" />,
  strong: ({ children }) => (
    <strong className="font-bold text-[#1d1c1d]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-[#e8e8e8]">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-[#e8e8e8] bg-[#fafafa]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[13px] font-bold text-[#1d1c1d]">
      {children}
    </th>
  ),
  tr: ({ children }) => (
    <tr className="border-b border-[#f0f0f0] last:border-0">{children}</tr>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top text-[14px] text-[#4d4d4d]">
      {children}
    </td>
  ),
};

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent = ({ content }: MarkdownContentProps) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
    {content}
  </ReactMarkdown>
);
