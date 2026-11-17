import Link from "next/link";
import type { Employee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CopyButton from "@/components/reminder/CopyButton";
import { loadFlash, resolveScope, type FlashScope, type FlashScopeRequest } from "@/lib/reminder-brief-data";
import {
  BUCKETS,
  bucketHeading,
  deptShort,
  formatDayLong,
  groupFlash,
  itemLine,
  siteBaseUrl,
  toWhatsApp,
  type Bucket,
  type DeptGroup,
  type FlashItem,
} from "@/lib/reminder-brief";

const MAX_ROWS = 8;
const ME_GROUP = "SAYA"; // kelompok tunggal untuk tab "Saya" (judul departemen disembunyikan)

const BADGE: Record<Bucket, string> = {
  late: "bg-red-50 text-red-700",
  today: "bg-amber-100 text-amber-800",
  tomorrow: "bg-yellow-100 text-yellow-800",
  soon: "bg-brand-50 text-brand-800",
};

export function parseFlash(v: string | string[] | undefined): FlashScopeRequest {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "dept" || s === "semua" ? s : "saya";
}

// Pisahkan kelompok menjadi bagian awal (maks. `limit` baris) dan sisanya.
function splitGroups(groups: DeptGroup[], limit: number): [DeptGroup[], DeptGroup[]] {
  let left = limit;
  const head: DeptGroup[] = [];
  const tail: DeptGroup[] = [];
  for (const g of groups) {
    const h: DeptGroup = { ...g, buckets: { late: [], today: [], tomorrow: [], soon: [] }, oldCount: 0 };
    const t: DeptGroup = { ...g, buckets: { late: [], today: [], tomorrow: [], soon: [] }, oldCount: 0 };
    for (const b of BUCKETS) {
      for (const it of g.buckets[b]) {
        if (left > 0) {
          h.buckets[b].push(it);
          left -= 1;
        } else t.buckets[b].push(it);
      }
    }
    const has = (x: DeptGroup) => BUCKETS.some((b) => x.buckets[b].length > 0);
    if (has(t)) t.oldCount = g.oldCount;
    else h.oldCount = g.oldCount;
    if (has(h) || h.oldCount > 0) head.push(h);
    if (has(t)) tail.push(t);
  }
  return [head, tail];
}

// Reminder: pekerjaan bertenggat paling lambat 3 hari lagi (dan yang baru lewat), per departemen.
export default async function ReminderBrief({
  me,
  today,
  flash,
  basePath = "/",
  full = false,
}: {
  me: Employee;
  today: string;
  flash: FlashScopeRequest;
  basePath?: string;
  full?: boolean;
}) {
  const supabase = await createClient();
  const scope: FlashScope = resolveScope(me, flash);
  const active: FlashScopeRequest = scope === "all" ? "semua" : "dept" in scope ? "dept" : "saya";
  const isMine = active === "saya";

  const raw = await loadFlash(supabase, { me, today, scope });
  const items: FlashItem[] = isMine ? raw.map((i) => ({ ...i, dept_code: ME_GROUP })) : raw;
  const groups = groupFlash(items, today);

  const wide = me.app_role === "admin" || me.app_role === "ceo";
  const tabs: { key: FlashScopeRequest; label: string }[] = [{ key: "saya", label: "Saya" }];
  if (me.dept_code && (wide || me.app_role === "head")) {
    tabs.push({ key: "dept", label: deptShort(me.dept_code) });
  }
  if (wide) tabs.push({ key: "semua", label: "Semua" });

  const scopeLabel = scope === "all" ? "Seluruh departemen" : "dept" in scope ? deptShort(scope.dept) : "";
  const texts = isMine ? [] : toWhatsApp(groups, today, scopeLabel, siteBaseUrl());

  const [head, tail] = full ? [groups, []] : splitGroups(groups, MAX_ROWS);
  const empty = groups.length === 0;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reminder</h2>
          <p className="text-[13px] text-slate-500 md:text-xs">{formatDayLong(today)} · tenggat sampai 3 hari lagi</p>
        </div>
        {!full && (
          <Link href={`/reminder?flash=${active}`} className="text-[13px] font-medium text-brand-700 hover:underline md:text-xs">
            Halaman penuh →
          </Link>
        )}
      </div>

      {tabs.length > 1 && (
        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 text-[15px] md:text-sm" aria-label="Cakupan Reminder">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`${basePath}?flash=${t.key}`}
              aria-current={t.key === active ? "page" : undefined}
              className={`flex-1 rounded-md px-3 py-1.5 text-center font-medium ${
                t.key === active ? "bg-white text-brand-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {empty ? (
        <p className="py-2 text-[15px] text-slate-500 md:text-sm">Tidak ada tenggat dalam 3 hari ke depan.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Groups groups={head} today={today} showDept={!isMine} />
          {tail.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[13px] font-medium md:text-xs text-brand-700 hover:underline">
                Lihat semua ({tail.reduce((n, g) => n + BUCKETS.reduce((m, b) => m + g.buckets[b].length, 0), 0)} lagi)
              </summary>
              <div className="mt-3">
                <Groups groups={tail} today={today} showDept={!isMine} />
              </div>
            </details>
          )}
        </div>
      )}

      <p className="text-[13px] text-slate-500 md:text-xs">
        Cek juga: <Link href="/penjualan" className="font-medium text-brand-700 hover:underline">Lead penjualan</Link>
        {" · "}
        <Link href="/projects" className="font-medium text-brand-700 hover:underline">Project</Link>
        {" · "}
        <Link href="/tugas" className="font-medium text-brand-700 hover:underline">Semua tugas</Link>
      </p>

      {!isMine && <CopyButton texts={texts} />}

      {full && !isMine && (
        <details open className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Pratinjau teks WhatsApp</summary>
          <div className="mt-2 flex flex-col gap-3">
            {texts.map((t, i) => (
              <pre key={i} className="whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs text-slate-800">
                {t}
              </pre>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Groups({ groups, today, showDept }: { groups: DeptGroup[]; today: string; showDept: boolean }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.dept} className="flex flex-col gap-1.5">
          {showDept && <p className="text-[15px] font-bold text-slate-900 md:text-sm">{g.label}</p>}
          {BUCKETS.map((b) =>
            g.buckets[b].length === 0 ? null : (
              <div key={b} className="flex flex-col">
                <p className={`self-start rounded-full px-2 py-0.5 text-[13px] font-semibold md:px-2 md:text-xs ${BADGE[b]}`}>{bucketHeading(b)}</p>
                <ul className="flex flex-col divide-y divide-slate-100">
                  {g.buckets[b].map((it) => (
                    <li key={it.id}>
                      <Link href={it.href} className="-mx-2 block rounded-lg px-2 py-2 text-[15px] text-slate-800 hover:bg-slate-50 md:py-1.5 md:text-sm">
                        {itemLine(it, today).slice(2)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
          {g.oldCount > 0 && (
            <p className="text-[13px] italic text-slate-500 md:text-xs">+{g.oldCount} pekerjaan terlambat lebih dari 7 hari</p>
          )}
        </div>
      ))}
    </>
  );
}
