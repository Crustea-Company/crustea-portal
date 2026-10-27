"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

// Isi sidebar: menu utama, menu sistem (admin), sub-menu yang bisa dibuka-tutup.

type Child = { href: string; label: string };
type Item = { href: string; label: string; icon: IconName; children?: Child[] };

const MENU: Item[] = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  {
    href: "/tugas",
    label: "Tugas",
    icon: "clipboard",
    children: [
      { href: "/tugas", label: "Semua tugas" },
      { href: "/tugas?pic=saya&sprint=semua", label: "Tugas saya" },
      { href: "/tugas/riwayat", label: "Riwayat tugas" },
    ],
  },
  { href: "/log-kerja", label: "Log Kerja", icon: "clock" },
  {
    href: "/pengajuan",
    label: "Pengajuan",
    icon: "receipt",
    children: [
      { href: "/pengajuan", label: "Pengajuan saya" },
      { href: "/pengajuan/reimburse/baru", label: "Ajukan reimburse" },
    ],
  },
  { href: "/prosedur", label: "Prosedur", icon: "book" },
];

// Ditambahkan ke sub-menu Pengajuan untuk F&A, admin, dan CEO.
const REVIEW_CHILD: Child = { href: "/pengajuan/review", label: "Review F&A" };

const SYSTEM: Item[] = [
  {
    href: "/admin",
    label: "Admin",
    icon: "shield",
    children: [
      { href: "/admin?bagian=karyawan", label: "Karyawan" },
      { href: "/admin?bagian=periode", label: "Periode ATS" },
      { href: "/admin?bagian=riwayat", label: "Riwayat perubahan" },
    ],
  },
];

type IconName = "home" | "grid" | "clipboard" | "clock" | "shield" | "chevron" | "book" | "receipt";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName | "logout" | "menu"; className?: string }) {
  const p = { viewBox: "0 0 24 24", className, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home":
      return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>;
    case "grid":
      return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "clipboard":
      return <svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m9 12 2 2 4-4" /></svg>;
    case "clock":
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "receipt":
      return <svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
    case "book":
      return <svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /><path d="M8 7h7M8 11h7" /></svg>;
    case "shield":
      return <svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "chevron":
      return <svg {...p}><path d="m6 9 6 6 6-6" /></svg>;
    case "logout":
      return <svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></svg>;
    case "menu":
      return <svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  }
}

export default function NavLinks({ isAdmin, canSeeReview }: { isAdmin: boolean; canSeeReview: boolean }) {
  const menu = canSeeReview
    ? MENU.map((m) => (m.href === "/pengajuan" ? { ...m, children: [...(m.children ?? []), REVIEW_CHILD] } : m))
    : MENU;
  return (
    <nav className="flex flex-col gap-6">
      <Section title="Menu" items={menu} />
      {isAdmin && <Section title="Sistem" items={SYSTEM} />}
    </nav>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <div>
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
      </ul>
    </div>
  );
}

function NavItem({ item }: { item: Item }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const inSection = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const [open, setOpen] = useState(inSection);

  // Sub-menu aktif: path sama dan semua parameter di link ikut cocok.
  const childActive = (href: string): boolean => {
    const url = new URL(href, "http://x");
    if (url.pathname !== pathname) return false;
    const params = [...url.searchParams.entries()];
    if (params.length === 0) {
      // "Semua tugas" / tanpa parameter: aktif kalau tidak sedang di sub-menu berparameter lain.
      return !(item.children ?? []).some((c) => c.href !== href && c.href.includes("?") && childActive(c.href));
    }
    return params.every(([k, v]) => search.get(k) === v);
  };

  const rowClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
      active ? "bg-brand-800 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"
    }`;
  const iconClass = (active: boolean) => `h-5 w-5 shrink-0 ${active ? "text-logo-lime" : "text-logo-leaf"}`;

  if (!item.children) {
    return (
      <li>
        <Link href={item.href} className={rowClass(inSection)} aria-current={inSection ? "page" : undefined}>
          <Icon name={item.icon} className={iconClass(inSection)} />
          {item.label}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} className={rowClass(false)} aria-expanded={open}>
        <Icon name={item.icon} className={iconClass(false)} />
        <span className="flex-1 text-left">{item.label}</span>
        <Icon name="chevron" className={`h-4 w-4 text-logo-leaf transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-3">
          {item.children.map((c) => {
            const active = childActive(c.href);
            return (
              <li key={c.href}>
                <Link
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                    active ? "bg-brand-800 font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-logo-lime" : "bg-slate-400"}`} />
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
