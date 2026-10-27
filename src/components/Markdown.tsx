import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Menampilkan teks berformat (judul, tebal, daftar, tabel, link) untuk isi prosedur.
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="mb-3 mt-6 text-xl font-bold text-brand-900 first:mt-0" {...p} />,
          h2: (p) => <h2 className="mb-3 mt-6 text-lg font-bold text-brand-900 first:mt-0" {...p} />,
          h3: (p) => <h3 className="mb-2 mt-5 font-semibold text-slate-900" {...p} />,
          p: (p) => <p className="mb-3" {...p} />,
          ul: (p) => <ul className="mb-3 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="mb-3 list-decimal space-y-1 pl-5" {...p} />,
          a: ({ href, ...p }) => (
            <a
              href={href}
              className="font-medium text-brand-700 underline underline-offset-2"
              {...(href?.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote className="mb-3 rounded-r-lg border-l-4 border-logo-lime bg-slate-50 px-3 py-2 text-slate-700" {...p} />
          ),
          table: (p) => (
            <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-xs" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-slate-50 text-slate-600" {...p} />,
          th: (p) => <th className="px-3 py-2 font-semibold" {...p} />,
          td: (p) => <td className="border-t border-slate-100 px-3 py-2 align-top" {...p} />,
          code: (p) => <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
