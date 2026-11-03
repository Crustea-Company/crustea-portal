import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, todayJakarta } from "@/lib/format";
import {
  buildOrgChart,
  cardColors,
  type OrgCard,
  type OrgEmployee,
  type OrgMember,
  type OrgPerson,
  type OrgPillar,
  type OrgUnit,
} from "@/lib/org";
import OrgEditor from "./OrgEditor";
import OrgExport from "./OrgExport";

export const metadata: Metadata = { title: "Struktur Organisasi - Crustea Portal" };

// Tata letak memakai container query (@4xl), bukan lebar layar, supaya unduhan PNG/PDF
// selalu berbentuk lebar seperti slide walau diunduh dari HP.
export default async function StrukturOrganisasiPage() {
  const me = (await getCurrentEmployee())!;
  const canEdit = me.app_role === "admin" || me.app_role === "ceo";
  const supabase = await createClient();

  const [pillarRes, unitRes, peopleRes, empRes, deptRes] = await Promise.all([
    supabase.from("org_pillars").select("id, name, sort_order"),
    supabase.from("org_units").select("dept_code, pillar_id, sort_order, display_name, accent, focus, colors"),
    supabase.from("org_people").select("employee_id, lead_dept, display_title"),
    supabase
      .from("employees")
      .select("id, full_name, dept_code, job_title, emp_status, app_role")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("departments").select("code, name").order("code"),
  ]);

  const error = pillarRes.error ?? unitRes.error ?? peopleRes.error ?? empRes.error ?? deptRes.error;
  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat struktur organisasi: {error.message}
        </p>
      </main>
    );
  }

  const pillars = (pillarRes.data ?? []) as OrgPillar[];
  const units = (unitRes.data ?? []) as OrgUnit[];
  const people = (peopleRes.data ?? []) as OrgPerson[];
  const employees = (empRes.data ?? []) as OrgEmployee[];
  const departments = (deptRes.data ?? []) as { code: string; name: string }[];
  const chart = buildOrgChart(pillars, units, people, employees);
  const deptName = new Map(departments.map((d) => [d.code, d.name]));
  const n = chart.pillars.length;
  const today = todayJakarta();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">
      {canEdit && chart.unplaced.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Peringatan: {chart.unplaced.length} karyawan aktif belum masuk kartu mana pun</p>
          <p className="mt-1">
            {chart.unplaced
              .map((e) => `${e.full_name} (${e.dept_code ? deptName.get(e.dept_code) ?? e.dept_code : "tanpa departemen"})`)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs">
            Masukkan departemennya ke salah satu kolom, atau jadikan orangnya pemimpin kartu, lewat tombol Ubah struktur.
            Hanya admin dan CEO yang melihat peringatan ini.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && <OrgEditor pillars={pillars} units={units} people={people} employees={employees} departments={departments} />}
        <OrgExport targetId="struktur-organisasi" fileName={`Struktur-Organisasi-${today}`} />
      </div>

      <div id="struktur-organisasi" className="@container flex flex-col gap-5 bg-background">
        <div className="flex flex-col gap-4 @4xl:grid @4xl:grid-cols-[1fr_auto_1fr] @4xl:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-logo-leaf">Crustea Indonesia</p>
            <h1 className="text-2xl font-bold text-brand-900 @xl:text-3xl">Struktur Organisasi</h1>
            <p className="text-sm text-slate-500">per {formatDate(today)}</p>
          </div>

          {chart.ceo ? (
            <div className="order-last rounded-2xl border-2 border-amber-400 bg-brand-900 px-6 py-4 text-center shadow-md @4xl:order-none @4xl:min-w-80">
              <p className="text-sm font-bold text-logo-lime">{chart.ceo.title}</p>
              <p className="mt-1 text-xl font-bold text-white @xl:text-2xl">{chart.ceo.name}</p>
            </div>
          ) : (
            <p className="order-last rounded-2xl border border-dashed border-slate-300 px-6 py-4 text-center text-sm text-slate-500 @4xl:order-none">
              Belum ada karyawan aktif berperan CEO.
            </p>
          )}

          <div className="flex @4xl:justify-self-end">
            <div className="flex flex-col items-center justify-center rounded-xl bg-brand-900 px-5 py-3 text-center shadow-sm">
              <span className="text-2xl font-bold text-logo-lime">{formatNumber(chart.total)}</span>
              <span className="text-[11px] font-semibold text-white">Karyawan aktif</span>
            </div>
          </div>
        </div>

        {n === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Belum ada kolom. {canEdit ? "Tambahkan lewat tombol Ubah struktur." : "Hubungi admin."}
          </p>
        ) : (
          <div className="flex flex-col items-center">
            {/* Garis dari kotak CEO turun ke garis penghubung kolom. */}
            <div className="h-5 w-0.5 bg-brand-300 @4xl:h-6" aria-hidden />
            <div
              className="grid w-full grid-cols-1 gap-5 @4xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))] @4xl:gap-4"
              style={{ "--cols": n } as CSSProperties}
            >
              {chart.pillars.map(({ pillar, cards }, i) => {
                const named = pillar.name.trim() !== "";
                return (
                  <section key={pillar.id} className="flex flex-col items-center">
                    {/* Garis penghubung (tampilan lebar): separuh kiri/kanan + batang ke kolom. */}
                    <div className="relative hidden h-5 w-full @4xl:block" aria-hidden>
                      {i > 0 && <span className="absolute left-[-0.5rem] right-1/2 top-0 h-0.5 bg-brand-300" />}
                      {i < n - 1 && <span className="absolute left-1/2 right-[-0.5rem] top-0 h-0.5 bg-brand-300" />}
                      <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-brand-300" />
                    </div>
                    {named && (
                      <h2 className="z-10 rounded-full bg-brand-900 px-6 py-2 text-center text-sm font-bold text-white shadow-sm">
                        {pillar.name}
                      </h2>
                    )}
                    <div
                      className={`flex w-full flex-1 flex-col gap-3 ${
                        named ? "-mt-4 rounded-2xl border border-slate-200 bg-white/60 p-2.5 pt-7" : ""
                      }`}
                    >
                      {cards.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Belum ada departemen.</p>}
                      {cards.map((c) => (
                        <DeptCard key={c.unit.dept_code} card={c} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function DeptCard({ card: { unit, members } }: { card: OrgCard }) {
  const c = cardColors(unit);
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border shadow-sm @4xl:[flex-grow:var(--grow)]"
      style={{ "--grow": members.length + 2, backgroundColor: c.bg, borderColor: c.border } as CSSProperties}
    >
      <div className="h-1.5" style={{ backgroundColor: c.bar }} />
      <div className="px-3 pt-2.5 @xl:px-4">
        <h3 className="text-base font-bold leading-tight @xl:text-lg" style={{ color: c.title }}>
          {unit.display_name}
        </h3>
        {unit.focus && (
          <p className="mt-0.5 text-xs" style={{ color: c.focus }}>
            {unit.focus}
          </p>
        )}
      </div>
      <ul className="mx-3 mb-3 mt-2.5 flex flex-1 flex-col justify-around gap-1 border-t pt-2 @xl:mx-4" style={{ borderColor: c.border }}>
        {members.length === 0 && <li className="py-2 text-center text-xs text-slate-400">Belum ada anggota aktif.</li>}
        {members.map((m) => (
          <MemberRow key={m.id} m={m} colors={c} />
        ))}
      </ul>
    </article>
  );
}

function MemberRow({ m, colors }: { m: OrgMember; colors: ReturnType<typeof cardColors> }) {
  return (
    <li className="rounded-lg px-2 py-1.5" style={m.isLead ? { backgroundColor: colors.lead_bg } : undefined}>
      <span className="block text-sm font-semibold leading-tight" style={{ color: colors.name }}>
        {m.name}
      </span>
      <span className="block text-xs leading-tight" style={{ color: colors.job }}>
        {m.title}
      </span>
    </li>
  );
}
