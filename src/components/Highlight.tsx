import { findRanges } from "@/lib/search";

// Beri warna pada kata yang dicari di teks pendek (judul, kode). terms = hasil searchTerms().
export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ranges = findRanges(text, terms);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) parts.push(text.slice(pos, a));
    parts.push(
      <mark key={a} className="rounded bg-amber-200/70 px-0.5 text-inherit">
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  }
  parts.push(text.slice(pos));
  return <>{parts}</>;
}
