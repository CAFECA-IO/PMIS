"use client";

import type { ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Mermaid } from "./mermaid";

type CodeProps = { className?: string; children?: unknown };

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            const props = (child as ReactElement<CodeProps>)?.props;
            const className = props?.className ?? "";
            if (/language-mermaid/.test(className)) {
              return <Mermaid chart={String(props?.children ?? "").trim()} />;
            }
            return <pre>{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
