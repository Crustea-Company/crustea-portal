import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { exportableEmployees } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { periodLabel, periodLabelWithRange } from "@/lib/ats";
import { buildLogWorkbook } from "@/lib/log-excel";

export const runtime = "nodejs";

type LogRow = {
  log_date: string;
  activity: string;
  minutes: number;
  proof: string | null;
  period_month: string;
  is_correction: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (message: string, status = 400) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// Unduh log kerja sebagai file Excel.
// Parameter: karyawan=<id>, lalu periode=YYYY-MM-01 atau dari=YYYY-MM-DD&sampai=YYYY-MM-DD.
export async function GET(request: NextRequest) {
  const me = await getCurrentEmployee();
  if (!me) return fail("Akses ditolak.", 403);

  const params = request.nextUrl.searchParams;
  const employeeId = params.get("karyawan") || me.id;
  const periode = params.get("periode");
  const dari = params.get("dari");
  const sampai = params.get("sampai");

  const allowed = await exportableEmployees(me);
  const employee = allowed.find((e) => e.id === employeeId);
  if (!employee) return fail("Anda tidak berhak mengunduh log karyawan ini.", 403);

  const supabase = await createClient();
  let rangeLabel: string;
  let fileRange: string;
  const base = () =>
    supabase
      .from("work_logs")
      .select("log_date, activity, minutes, proof, period_month, is_correction")
      .eq("employee_id", employee.id);

  let build: () => ReturnType<typeof base>;
  if (periode) {
    if (!/^\d{4}-\d{2}-01$/.test(periode)) return fail("Periode tidak valid.");
    build = () => base().eq("period_month", periode);
    rangeLabel = `Periode ${periodLabelWithRange(periode)}`;
    fileRange = periode.slice(0, 7);
  } else if (dari && sampai && DATE_RE.test(dari) && DATE_RE.test(sampai)) {
    if (dari > sampai) return fail("Tanggal awal harus sebelum tanggal akhir.");
    build = () => base().gte("log_date", dari).lte("log_date", sampai);
    rangeLabel = `${formatDate(dari)} - ${formatDate(sampai)}`;
    fileRange = `${dari}_${sampai}`;
  } else {
    return fail("Pilih periode atau rentang tanggal.");
  }

  // Ambil semua baris (database membatasi 1.000 baris per permintaan).
  const logs: LogRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build()
      .order("log_date")
      .order("created_at")
      .range(from, from + 999);
    if (error) return fail(`Gagal mengambil data: ${error.message}`, 500);
    logs.push(...((data ?? []) as LogRow[]));
    if (!data || data.length < 1000) break;
  }

  const buffer = await buildLogWorkbook({
    title: `Log Kerja - ${employee.full_name}${employee.dept_code ? ` (${employee.dept_code})` : ""}`,
    rangeLabel,
    rows: logs.map((l) => ({ ...l, period: periodLabel(l.period_month) })),
  });

  const safeName = employee.full_name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="log-kerja_${safeName}_${fileRange}.xlsx"`,
    },
  });
}
