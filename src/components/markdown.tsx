"use client";

import { Children, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { slugifyHeading } from "@/lib/doc-toc";
import { detectCustomChartType } from "@/lib/custom-chart-parser";
import { Mermaid } from "@/components/mermaid";
import { CustomChart } from "@/components/custom-chart";

type CodeProps = { className?: string; children?: unknown };

// Info: (20260722 - Luphia) 由標題子節點還原純文字，以產生與目錄一致的錨點 id
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el?.props?.children != null) return nodeText(el.props.children);
  return "";
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2({ children }) {
            return <h2 id={slugifyHeading(nodeText(children))}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 id={slugifyHeading(nodeText(children))}>{children}</h3>;
          },
          pre({ children }) {
            const child = Children.toArray(children)[0] ?? children;
            const props = (child as ReactElement<CodeProps>)?.props;
            const className = props?.className ?? "";
            const source = String(props?.children ?? "").trim();
            if (/language-mermaid/.test(className)) {
              return <Mermaid chart={source} />;
            }
            // Info: (20260803 - Julian) 四種自訂圖表 fence（custom-matrix 等）比照 mermaid 掛勾
            const lang = /language-([\w-]+)/.exec(className)?.[1] ?? "";
            if (detectCustomChartType(lang)) {
              return <CustomChart lang={lang} source={source} />;
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
