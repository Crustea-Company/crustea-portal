"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/app/(app)/notifications";

const REFRESH_MS = 60_000;

// Selisih hari antara tanggal notifikasi dibuat (WIB) dan deadline: H-3, H-2, H-1.
function daysBefore(deadline: string, createdAt: string): number {
  const created = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(createdAt));
  return Math.round((Date.parse(deadline) - Date.parse(created)) / 86_400_000);
}

function describe(n: NotificationItem): { label: string; text: string } {
  if (n.kind === "request") return { label: "Pengajuan", text: n.title };
  if (n.kind === "sla") return { label: "Lewat SLA", text: n.title };
  if (n.kind === "sales") return { label: "Penjualan", text: n.title };
  if (n.kind === "asset") return { label: "Aset", text: n.title };
  if (n.kind === "aqua") return { label: "Aquaculture", text: n.title };
  const code = n.task?.code ? `${n.task.code} ` : "";
  if (n.kind === "delegation") {
    return {
      label: "Delegasi",
      text: `${n.actor?.full_name ?? "Seseorang"} mendelegasikan tugas kepada Anda: ${code}${n.title}`,
    };
  }
  if (n.kind === "deadline" && n.task?.deadline) {
    return {
      label: `Deadline H-${daysBefore(n.task.deadline, n.created_at)}`,
      text: `${code}${n.title} (deadline ${formatDate(n.task.deadline)})`,
    };
  }
  return { label: "Pengingat", text: `${code}${n.title}` };
}

const LABEL_STYLE: Record<NotificationItem["kind"], string> = {
  reminder: "bg-violet-100 text-violet-800",
  delegation: "bg-brand-100 text-brand-800",
  deadline: "bg-red-100 text-red-700",
  request: "bg-amber-100 text-amber-800",
  sla: "bg-red-600 text-white",
  sales: "bg-brand-100 text-brand-800",
  asset: "bg-slate-200 text-slate-800",
  aqua: "bg-brand-100 text-brand-800",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await loadNotifications();
    setItems(res.items);
    setUnread(res.unread);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Tutup panel saat mengklik di luar.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openItem(n: NotificationItem) {
    if (!n.read_at) await markNotificationRead(n.id);
    if (n.link?.startsWith("/")) {
      window.location.assign(n.link);
    } else if (n.request_id) {
      window.location.assign(`/pengajuan/${n.request_id}`);
    } else if (n.task_id && n.task) {
      const qs = new URLSearchParams({ dept: n.task.dept_code, sprint: "semua" });
      // Muat ulang penuh supaya halaman Tugas langsung menggulir ke tugasnya.
      // (Kalau alamatnya sama persis, mengganti # saja tidak memuat ulang halaman.)
      const target = `/tugas?${qs}`;
      if (window.location.pathname + window.location.search === target) {
        window.location.hash = `task-${n.task_id}`;
        window.location.reload();
      } else {
        window.location.assign(`${target}#task-${n.task_id}`);
      }
    } else {
      refresh();
    }
  }

  async function readAll() {
    await markAllNotificationsRead();
    refresh();
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
        aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}
        className="relative rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-16 z-40 max-h-[75vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2">
            <p className="font-semibold text-slate-900">Notifikasi</p>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="text-xs font-medium text-brand-700 hover:underline">
                Tandai semua dibaca
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Belum ada notifikasi.</p>
          ) : (
            <ul>
              {items.map((n) => {
                const d = describe(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                        n.read_at ? "" : "bg-brand-50/60"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`rounded px-1.5 py-0.5 font-semibold ${LABEL_STYLE[n.kind]}`}>{d.label}</span>
                        <span className="text-slate-500">{formatDateTime(n.created_at)}</span>
                        {!n.read_at && <span className="ml-auto h-2 w-2 rounded-full bg-brand-600" aria-label="Belum dibaca" />}
                      </span>
                      <span className="text-slate-800">{d.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
