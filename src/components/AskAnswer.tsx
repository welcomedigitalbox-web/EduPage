'use client';

// The answer comes back as Markdown — headings, tables, bold — because that is
// how a written answer is shaped. Rendering it as plain text put the pipes and
// hashes in front of the reader instead of the figures.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AskAnswer({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mt-5 mb-2 text-base font-semibold first:mt-0" {...p} />,
          h2: (p) => <h2 className="mt-5 mb-2 text-base font-semibold first:mt-0" {...p} />,
          h3: (p) => <h3 className="mt-4 mb-1.5 text-sm font-semibold" {...p} />,
          p: (p) => <p className="my-2.5" {...p} />,
          ul: (p) => <ul className="my-2.5 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="my-2.5 list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li className="pl-1" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          a: (p) => <a className="text-brand underline" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => <code className="rounded bg-edge px-1 py-0.5 font-mono text-[13px]" {...p} />,
          hr: () => <hr className="my-4 border-edge" />,
          blockquote: (p) => <blockquote className="my-3 border-l-2 border-edge pl-3 text-muted" {...p} />,
          // A table of figures is the point of most answers, so it gets room to
          // breathe and can scroll on a phone rather than squeezing.
          table: (p) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-edge">
              <table className="w-full border-collapse text-sm" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-edge/60 text-muted" {...p} />,
          th: (p) => <th className="border-b border-edge px-3 py-2 text-left font-medium" {...p} />,
          td: (p) => <td className="border-b border-edge/60 px-3 py-2 align-top" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
