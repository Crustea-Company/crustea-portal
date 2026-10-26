"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import NavLinks, { Icon } from "./NavLinks";
import NotificationBell from "./NotificationBell";
import StickyHeader from "./StickyHeader";

const TITLES: [string, string][] = [
  ["/tugas/riwayat", "Riwayat tugas"],
  ["/tugas", "Tugas"],
  ["/dashboard", "Dashboard"],
  ["/log-kerja", "Log Kerja"],
  ["/admin", "Admin"],
];

const ROLE_LABEL: Record<string, string> = { admin: "Admin", ceo: "CEO", head: "Kepala Departemen", staff: "Staf" };

// Kerangka halaman: sidebar kiri (di HP muncul dari samping lewat tombol ☰)
// dan bilah atas berisi judul halaman serta lonceng notifikasi.
export default function AppShell({
  fullName,
  role,
  isAdmin,
  children,
}: {
  fullName: string;
  role: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false); // HP
  const [collapsed, setCollapsed] = useState(false); // layar lebar

  // Tutup laci menu di HP setiap pindah halaman.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const title = pathname === "/" ? "Beranda" : (TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Crustea Portal");

  const toggle = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) setCollapsed((c) => !c);
    else setDrawerOpen((o) => !o);
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-6 pt-5">
        <Image src="/brand/crustea-logo.png" alt="" width={30} height={40} className="h-9 w-auto" priority />
        <span className="leading-tight">
          <span className="block text-2xl font-bold tracking-tight text-brand-900">Crustea</span>
          <span className="block text-xs font-medium text-slate-500">Portal</span>
        </span>
      </Link>

      <div className="flex-1 overflow-y-auto px-3">
        <Suspense>
          <NavLinks isAdmin={isAdmin} />
        </Suspense>
      </div>

      <div className="border-t border-slate-200 px-3 py-3">
        <div className="px-3 pb-2">
          <p className="truncate text-sm font-semibold text-slate-900">{fullName}</p>
          <p className="text-xs text-slate-500">{ROLE_LABEL[role] ?? role}</p>
        </div>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-red-50 hover:text-red-700"
          >
            <Icon name="logout" className="h-5 w-5 text-logo-leaf" />
            Keluar
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar layar lebar */}
      {!collapsed && (
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 lg:block">{sidebar}</aside>
      )}

      {/* Laci menu di HP */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <StickyHeader>
          <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
            <button
              type="button"
              onClick={toggle}
              aria-label="Buka/tutup menu"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <Icon name="menu" />
            </button>
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-brand-900">{title}</h1>
            <span className="hidden text-sm text-slate-600 md:inline">{fullName}</span>
            <NotificationBell />
          </div>
        </StickyHeader>
        {children}
      </div>
    </div>
  );
}
