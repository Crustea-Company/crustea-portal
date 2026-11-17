"use client";

import { useEffect, useRef } from "react";

// <details> yang tertutup di HP dan otomatis terbuka di layar lebar (lg ke atas).
export default function OpenOnDesktop({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches && ref.current) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
