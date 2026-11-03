import Link from "next/link";

// Tab di atas halaman Komunitas. Tinjauan CA hanya untuk Corporate Affairs dan admin.
export default function KomunitasNav({ active, reviewer }: { active: "papan" | "kirim" | "saya" | "tinjau"; reviewer: boolean }) {
  const tabs = [
    { key: "papan", href: "/komunitas", label: "Papan komunitas" },
    { key: "kirim", href: "/komunitas/kirim", label: "Kirim masukan" },
    { key: "saya", href: "/komunitas/masukan", label: "Masukan saya" },
    ...(reviewer ? [{ key: "tinjau", href: "/komunitas/tinjau", label: "Tinjauan CA" }] : []),
  ];
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
            active === t.key ? "bg-brand-800 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
