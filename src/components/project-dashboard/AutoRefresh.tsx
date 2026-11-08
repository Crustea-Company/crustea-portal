"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Memuat ulang data halaman setiap `seconds` detik selama tab terlihat (dashboard "real-time").
export default function AutoRefresh({ seconds = 30, loadedAt }: { seconds?: number; loadedAt: string }) {
  const router = useRouter();
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(loadedAt)),
    );
  }, [loadedAt]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, seconds * 1000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden />
      Diperbarui otomatis tiap {seconds} detik{label && ` · terakhir ${label} WIB`}
    </p>
  );
}
