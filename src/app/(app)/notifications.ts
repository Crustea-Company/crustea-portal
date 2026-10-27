"use server";

import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type NotificationItem = {
  id: number;
  kind: "reminder" | "delegation" | "deadline" | "request" | "sla" | "sales" | "asset";
  title: string;
  created_at: string;
  read_at: string | null;
  task_id: string | null;
  request_id: string | null;
  link: string | null; // halaman tujuan (penjualan, aset)
  task: { code: string | null; dept_code: string; deadline: string | null } | null;
  actor: { full_name: string } | null;
};

// Membuat notifikasi yang sudah jatuh waktu (pengingat, deadline H-3/H-2/H-1),
// lalu mengambil 30 notifikasi terbaru milik pengguna.
export async function loadNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const me = await getCurrentEmployee();
  if (!me) return { items: [], unread: 0 };

  const supabase = await createClient();
  await supabase.rpc("sync_my_notifications");

  const [listRes, unreadRes] = await Promise.all([
    supabase
      .from("notifications")
      .select(
        "id, kind, title, created_at, read_at, task_id, request_id, link, task:tasks(code, dept_code, deadline), actor:employees!notifications_actor_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);

  return {
    items: (listRes.data ?? []) as unknown as NotificationItem[],
    unread: unreadRes.count ?? 0,
  };
}

export async function markNotificationRead(id: number): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}
