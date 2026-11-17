"use client";

import { useState } from "react";

// Di HP: tiga kelompok "Perlu perhatian saya" jadi tab. Mulai layar md: ketiganya tampil berdampingan.
export default function AttentionTabs({
  tabs,
}: {
  tabs: { key: string; label: string; count: number; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm md:hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === active}
            onClick={() => setActive(t.key)}
            className={`flex-1 rounded-md px-2 py-1.5 font-medium ${
              t.key === active ? "bg-white text-brand-800 shadow-sm" : "text-slate-600"
            }`}
          >
            {t.label} <span className="text-xs tabular-nums text-slate-500">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {tabs.map((t) => (
          <div key={t.key} className={t.key === active ? "" : "hidden md:block"}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
