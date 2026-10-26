"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Beranda" },
  { href: "/tugas", label: "Tugas" },
  { href: "/log-kerja", label: "Log Kerja" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
