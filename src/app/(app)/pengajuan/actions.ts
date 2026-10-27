"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayJakarta } from "@/lib/format";
import { ASSIGNER_ROLES, loadTravelSetup } from "@/lib/travel-data";
import { calcTravel, isIsoDate, type TravelData, type TravelInput } from "@/lib/travel";
import { MAX_COMMISSION_LINES, type CommissionLineInput } from "@/lib/commission";
import {
  BUCKET,
  MAX_FILES,
  MIN_VENDORS,
  PAYMENT_CONTRACT,
  PAYMENT_PRIORITIES,
  REIMBURSE_CATEGORIES,
  type AttachmentInput,
  type PaymentData,
  type PaymentInput,
  type ProcurementData,
  type ProcurementInput,
  type ReimburseData,
  type ReimburseInput,
  type RequestKind,
  type RequestStatus,
  type VendorQuote,
} from "@/lib/requests";

type Result = { ok: true; id: string } | { ok: false; message: string };
type SimpleResult = { ok: true } | { ok: false; message: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateRequests(id?: string) {
  revalidatePath("/pengajuan");
  revalidatePath("/pengajuan/review");
  if (id) revalidatePath(`/pengajuan/${id}`);
}

// Memeriksa lampiran: link harus http(s), file harus di folder Storage milik sendiri.
function checkAttachments(list: AttachmentInput[], employeeId: string): string | null {
  if (list.length > MAX_FILES) return `Maksimal ${MAX_FILES} lampiran.`;
  for (const a of list) {
    if (a.kind === "link" && !/^https?:\/\/\S+$/i.test(a.url.trim())) return `Link tidak valid: ${a.url}`;
    if (a.kind === "file" && !a.id && !a.path.startsWith(`${employeeId}/`)) return "Lampiran tidak valid.";
  }
  return null;
}

// Menyamakan lampiran di database dengan daftar dari form: hapus yang dibuang, tambah yang baru.
async function syncAttachments(
  supabase: Supabase,
  requestId: string,
  purpose: "proof" | "transfer" | "report",
  list: AttachmentInput[],
): Promise<string | null> {
  const { data: existing, error: readErr } = await supabase
    .from("request_files")
    .select("id, kind, path")
    .eq("request_id", requestId)
    .eq("purpose", purpose);
  if (readErr) return readErr.message;

  const keep = new Set(list.map((a) => a.id).filter(Boolean));
  const removed = (existing ?? []).filter((f) => !keep.has(f.id));
  if (removed.length) {
    const { error } = await supabase.from("request_files").delete().in("id", removed.map((f) => f.id));
    if (error) return error.message;
    const paths = removed.filter((f) => f.kind === "file" && f.path).map((f) => f.path as string);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  const added = list.filter((a) => !a.id);
  if (added.length) {
    const { error } = await supabase.from("request_files").insert(
      added.map((a) =>
        a.kind === "file"
          ? { request_id: requestId, purpose, kind: "file", path: a.path, name: a.name, size_bytes: a.size_bytes }
          : { request_id: requestId, purpose, kind: "link", url: a.url.trim(), name: a.name.trim() || a.url.trim() },
      ),
    );
    if (error) return error.message;
  }
  return null;
}

function parseReimburse(input: ReimburseInput): { error: string } | { title: string; amount: number; data: ReimburseData } {
  const description = input.description.trim();
  const categories = input.categories.filter((c) => (REIMBURSE_CATEGORIES as readonly string[]).includes(c));
  const other = input.category_other.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transaction_date)) return { error: "Tanggal transaksi belum diisi." };
  if (input.transaction_date > todayJakarta()) return { error: "Tanggal transaksi tidak boleh di masa depan." };
  if (!description) return { error: "Uraian transaksi belum diisi." };
  if (categories.length === 0 && !other) return { error: "Pilih minimal satu kategori transaksi." };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { error: "Jumlah (Rp) harus lebih dari 0." };

  let mission = input.mission;
  const reason = input.no_mission_reason.trim();
  if (mission) {
    mission = {
      activity: mission.activity.trim(),
      description: mission.description.trim(),
      result: mission.result.trim(),
      evaluation: mission.evaluation.trim(),
    };
    if (!mission.activity || !mission.description || !mission.result || !mission.evaluation) {
      return { error: "Lengkapi keempat kolom mission report, atau centang \"Tidak ada mission report\" dan beri alasannya." };
    }
  } else if (!reason) {
    return { error: "Tuliskan alasan tidak ada mission report." };
  }

  return {
    title: description,
    amount: input.amount,
    data: {
      transaction_date: input.transaction_date,
      categories,
      category_other: other,
      mission,
      no_mission_reason: mission ? "" : reason,
    },
  };
}

// Simpan lalu kirim pengajuan. id = null untuk pengajuan baru;
// id terisi untuk mengubah draf / pengajuan "Perlu perbaikan" lalu mengirimnya ulang.
async function saveAndSubmit(
  kind: RequestKind,
  row: { title: string; amount: number; data: object; assigner_id?: string },
  attachments: AttachmentInput[],
  id: string | null,
  missingFiles: string | null, // null = lampiran boleh kosong
): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  if (attachments.length === 0 && missingFiles) return { ok: false, message: missingFiles };
  const badFile = checkAttachments(attachments, me.id);
  if (badFile) return { ok: false, message: badFile };

  const supabase = await createClient();
  let requestId = id;

  if (requestId) {
    // Database hanya mengizinkan mengubah milik sendiri saat Draf / Perlu perbaikan.
    const { data, error } = await supabase.from("requests").update(row).eq("id", requestId).select("id");
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    if (!data?.length) return { ok: false, message: "Pengajuan ini tidak bisa diubah lagi." };
  } else {
    const { data, error } = await supabase
      .from("requests")
      .insert({ kind, requester_id: me.id, ...row })
      .select("id")
      .single();
    if (error) return { ok: false, message: `Gagal menyimpan: ${error.message}` };
    requestId = data.id as string;
  }

  const fileErr = await syncAttachments(supabase, requestId, "proof", attachments);
  if (fileErr) {
    // Pengajuan baru yang gagal dibatalkan supaya tidak ada draf setengah jadi.
    // (File di Storage dibiarkan; form memakainya lagi saat dikirim ulang.)
    if (!id) await supabase.from("requests").delete().eq("id", requestId);
    return { ok: false, message: `Gagal menyimpan lampiran: ${fileErr}` };
  }

  const { error: submitErr } = await supabase.rpc("change_request_status", { p_id: requestId, p_to: "submitted" });
  if (submitErr) {
    if (!id) await supabase.from("requests").delete().eq("id", requestId);
    return { ok: false, message: `Gagal mengirim: ${submitErr.message}` };
  }

  revalidateRequests(requestId);
  return { ok: true, id: requestId };
}

export async function submitReimburse(
  input: ReimburseInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const parsed = parseReimburse(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  return saveAndSubmit("reimburse", parsed, attachments, id, "Lampirkan bukti nota (file atau link).");
}

function parsePayment(input: PaymentInput): { error: string } | { title: string; amount: number; data: PaymentData } {
  const vendor = input.vendor.trim();
  const account = input.account.trim();
  const purpose = input.purpose.trim();
  const method = input.method.trim();
  const contract = input.contract.filter((c) => c in PAYMENT_CONTRACT);

  if (!(input.priority in PAYMENT_PRIORITIES)) return { error: "Pilih prioritas pembayaran." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payment_date)) return { error: "Tanggal pembayaran belum diisi." };
  if (!method) return { error: "Pilih metode pembayaran." };
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) return { error: "Jumlah (Rp) harus lebih dari 0." };
  if (!vendor) return { error: "Vendor / nama penerima belum diisi." };
  if (!account) return { error: "Nomor rekening / VA / QRIS belum diisi." };
  if (!purpose) return { error: "Tujuan pembayaran belum diisi." };
  if (contract.length === 0) return { error: "Centang minimal satu pilihan \"Terkait kontrak\"." };

  const firstLine = purpose.split("\n")[0];
  return {
    title: `${vendor}: ${firstLine}`.slice(0, 200),
    amount: input.amount,
    data: { priority: input.priority, payment_date: input.payment_date, method, vendor, account, purpose, contract },
  };
}

export async function submitPayment(
  input: PaymentInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const parsed = parsePayment(input);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  return saveAndSubmit("payment", parsed, attachments, id, "Lampirkan link invoice atau dokumen pendukung.");
}

// Penugasan perjalanan dinas: biaya dihitung ulang di server dengan tarif golongan pemohon.
export async function submitTravel(
  input: TravelInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const destination = input.destination.trim();
  const target = input.target.trim();
  const reason = input.emergency_reason.trim();
  const nums = [input.distance_km, input.province_factor, input.ticket, input.private_km, input.representation];
  if (!destination) return { ok: false, message: "Tujuan/lokasi belum diisi." };
  if (!target) return { ok: false, message: "Target tugas belum diisi." };
  if (!isIsoDate(input.depart_date) || !isIsoDate(input.return_date)) {
    return { ok: false, message: "Tanggal berangkat dan kembali wajib diisi." };
  }
  if (nums.some((n) => !Number.isSafeInteger(n) || n < 0)) return { ok: false, message: "Angka tidak boleh negatif." };
  if (input.province_factor < 70 || input.province_factor > 100) {
    return { ok: false, message: "Faktor uang harian dalam provinsi harus 70-100%." };
  }

  const supabase = await createClient();
  const today = todayJakarta();
  const [{ rates, params, holidays, error }, meRes, assignerRes] = await Promise.all([
    loadTravelSetup(supabase, today),
    supabase.from("employees").select("grade").eq("id", me.id).single(),
    supabase.from("employees").select("id, full_name, job_title, is_active, app_role").eq("id", input.assigner_id).maybeSingle(),
  ]);
  if (error) return { ok: false, message: `Gagal memuat tarif dinas: ${error}` };
  const rate = rates.find((r) => r.grade === meRes.data?.grade);
  if (!rate) return { ok: false, message: "Golongan jabatan Anda belum diatur. Hubungi admin." };
  const assigner = assignerRes.data;
  if (!assigner?.is_active || !ASSIGNER_ROLES.includes(assigner.app_role as string)) {
    return { ok: false, message: "Penugas harus kepala departemen atau pimpinan." };
  }
  if (assigner.id === me.id && me.app_role !== "ceo") return { ok: false, message: "Penugas tidak boleh diri sendiri." };
  if (input.representation > rate.representation) {
    return {
      ok: false,
      message: rate.representation
        ? "Representasi melebihi plafon golongan Anda."
        : "Golongan Anda tidak mendapat biaya representasi.",
    };
  }

  const calc = calcTravel(input, rate, params, today, new Set(holidays));
  if (!calc) return { ok: false, message: "Tanggal kembali tidak boleh sebelum tanggal berangkat." };
  if (!calc.meets_notice && !reason) {
    return { ok: false, message: "Tenggat penugasan tidak terpenuhi: tuliskan alasan darurat." };
  }

  const { assigner_id, ...rest } = input;
  const data: TravelData = {
    ...rest,
    destination,
    target,
    emergency_reason: calc.meets_notice ? "" : reason,
    form_date: today,
    assigner_name: assigner.full_name as string,
    assigner_title: (assigner.job_title as string | null) ?? "",
    grade: rate.grade,
    grade_label: rate.label,
    rate,
    calc,
  };
  return saveAndSubmit(
    "travel",
    { title: `Dinas ke ${destination}`.slice(0, 200), amount: calc.total, data, assigner_id },
    attachments,
    id,
    null,
  );
}

// Permohonan pengadaan (PR): ditinjau head departemen pemohon dulu, lampiran boleh kosong.
export async function submitProcurement(
  input: ProcurementInput,
  attachments: AttachmentInput[],
  id: string | null,
): Promise<Result> {
  const title = input.title.trim();
  const specification = input.specification.trim();
  const unit = input.unit.trim();
  if (!title) return { ok: false, message: "Judul kebutuhan belum diisi." };
  if (!specification) return { ok: false, message: "Spesifikasi belum diisi." };
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return { ok: false, message: "Jumlah harus lebih dari 0." };
  if (!unit) return { ok: false, message: "Satuan belum diisi." };
  if (!Number.isSafeInteger(input.estimate) || input.estimate <= 0) {
    return { ok: false, message: "Estimasi harga (Rp) harus lebih dari 0." };
  }
  if (!isIsoDate(input.needed_date)) return { ok: false, message: "Tanggal dibutuhkan belum diisi." };

  const data: ProcurementData = {
    specification,
    quantity: input.quantity,
    unit,
    estimate: input.estimate,
    budgeted: Boolean(input.budgeted),
    needed_date: input.needed_date,
  };
  return saveAndSubmit("procurement", { title: title.slice(0, 200), amount: input.estimate, data }, attachments, id, null);
}

// Klaim komisi: HPP, % komisi, profit, dan komisi dihitung database dari master produk (migrasi 011);
// baris dari penjualan (lead_id) diisi database dari lead (migrasi 012).
export async function submitCommission(lines: CommissionLineInput[], id: string | null): Promise<Result> {
  if (lines.length === 0) return { ok: false, message: "Isi minimal satu baris penjualan." };
  if (lines.length > MAX_COMMISSION_LINES) return { ok: false, message: `Maksimal ${MAX_COMMISSION_LINES} baris penjualan.` };
  const today = todayJakarta();
  const clean: CommissionLineInput[] = [];
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    // Baris dari penjualan: database mengisi ulang semua kolom dari lead dan memeriksa hak klaimnya.
    if (l.lead_id) {
      clean.push({ ...l, justification: l.justification.trim(), lead_id: l.lead_id });
      continue;
    }
    const line = {
      customer: l.customer.trim(),
      invoice: l.invoice.trim(),
      closing_date: l.closing_date,
      product_code: l.product_code,
      units: l.units,
      sales_total: l.sales_total,
      justification: l.justification.trim(),
      referral_code: l.referral_code.trim().toUpperCase(),
    };
    if (!line.customer) return { ok: false, message: `Baris ${n}: nama customer belum diisi.` };
    if (!line.invoice) return { ok: false, message: `Baris ${n}: no. invoice/PO/kontrak belum diisi.` };
    if (!isIsoDate(line.closing_date)) return { ok: false, message: `Baris ${n}: tanggal closing belum diisi.` };
    if (line.closing_date > today) return { ok: false, message: `Baris ${n}: tanggal closing tidak boleh di masa depan.` };
    if (!line.product_code) return { ok: false, message: `Baris ${n}: pilih produk.` };
    if (!Number.isSafeInteger(line.units) || line.units < 1) return { ok: false, message: `Baris ${n}: jumlah unit minimal 1.` };
    if (!Number.isSafeInteger(line.sales_total) || line.sales_total <= 0) {
      return { ok: false, message: `Baris ${n}: total penjualan belum diisi.` };
    }
    if (!/^https?:\/\/\S+$/i.test(line.justification)) {
      return { ok: false, message: `Baris ${n}: justifikasi harus berupa link (diawali https://).` };
    }
    clean.push(line);
  }
  const first = clean[0].customer;
  const title = `Komisi ${first}${clean.length > 1 ? ` + ${clean.length - 1} penjualan lain` : ""}`.slice(0, 200);
  return saveAndSubmit("commission", { title, amount: 0, data: { lines: clean } }, [], id, null);
}

// F&A menerima klaim komisi. Baris manual wajib dicentang lunas; baris dari penjualan diperiksa database
// (status Lunas di modul Penjualan).
export async function approveCommission(id: string, note: string, salesPaid: boolean): Promise<SimpleResult> {
  return runStatus(id, "approved", note, null, { sales_paid: salesPaid });
}

// TechOps: perbandingan minimal 3 vendor + satu rekomendasi -> "Vendor dibandingkan".
export async function submitVendorComparison(
  id: string,
  vendors: VendorQuote[],
  recommended: number,
  note: string,
): Promise<SimpleResult> {
  const clean = vendors.map((v) => ({
    name: v.name.trim(),
    avl: Boolean(v.avl),
    price: v.price,
    spec: v.spec.trim(),
    lead_time: v.lead_time.trim(),
    warranty: v.warranty.trim(),
    pros: v.pros.trim(),
    cons: v.cons.trim(),
  }));
  if (clean.length < MIN_VENDORS) return { ok: false, message: `Isi minimal ${MIN_VENDORS} vendor pembanding.` };
  for (const [i, v] of clean.entries()) {
    if (!v.name) return { ok: false, message: `Nama vendor ke-${i + 1} belum diisi.` };
    if (!Number.isSafeInteger(v.price) || v.price <= 0) return { ok: false, message: `Harga vendor ${v.name} belum diisi.` };
  }
  if (!Number.isInteger(recommended) || recommended < 0 || recommended >= clean.length) {
    return { ok: false, message: "Pilih satu vendor yang direkomendasikan." };
  }
  return runStatus(id, "vendor_compared", note, null, { vendors: clean, recommended });
}

// Head F&A: pilih vendor + metode -> "Disetujui Head F&A" (>= Rp5 juta otomatis ke CEO).
export async function chooseProcurementVendor(
  id: string,
  selected: number,
  method: string,
  note: string,
): Promise<SimpleResult> {
  if (!Number.isInteger(selected) || selected < 0) return { ok: false, message: "Pilih vendor." };
  if (!method.trim()) return { ok: false, message: "Pilih metode pengadaan." };
  return runStatus(id, "fa_approved", note, null, { selected, method: method.trim() });
}

async function runStatus(
  id: string,
  to: RequestStatus,
  note: string,
  paidOn: string | null,
  data: object | null,
): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_request_status", {
    p_id: id,
    p_to: to,
    p_note: note.trim() || null,
    p_paid_on: paidOn,
    p_data: data,
  });
  if (error) return { ok: false, message: error.message };
  revalidateRequests(id);
  return { ok: true };
}

// Pemohon melampirkan FPTD & laporan misi (link) setelah kembali. F&A diberi tahu lewat catatan.
export async function submitTravelReport(id: string, attachments: AttachmentInput[]): Promise<SimpleResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };
  if (attachments.length === 0) return { ok: false, message: "Tempel link FPTD dan laporan misi." };
  const bad = checkAttachments(attachments, me.id);
  if (bad) return { ok: false, message: bad };

  const supabase = await createClient();
  const err = await syncAttachments(supabase, id, "report", attachments);
  if (err) return { ok: false, message: `Gagal menyimpan: ${err}` };
  await supabase.rpc("add_request_note", { p_id: id, p_note: "FPTD dan laporan misi sudah dilampirkan." });
  revalidateRequests(id);
  return { ok: true };
}

// Ubah status oleh peninjau (atau kirim ulang oleh pemohon). Aturan urutan & peran ada di database.
export async function changeRequestStatus(
  id: string,
  to: RequestStatus,
  note: string,
  paidOn: string | null,
  transferFiles: AttachmentInput[] = [],
  documents: AttachmentInput[] = [], // pengadaan: link PO / GRN / invoice (ditambahkan, tidak mengganti)
): Promise<SimpleResult> {
  const me = await getCurrentEmployee();
  if (!me) return { ok: false, message: "Sesi login berakhir. Silakan masuk lagi." };

  const supabase = await createClient();
  if (to === "paid") {
    if (!paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, message: "Tanggal transfer wajib diisi." };
    if (transferFiles.length) {
      const bad = checkAttachments(transferFiles, me.id);
      if (bad) return { ok: false, message: bad };
      const err = await syncAttachments(supabase, id, "transfer", transferFiles);
      if (err) return { ok: false, message: `Gagal menyimpan bukti transfer: ${err}` };
    }
  }

  if (documents.length) {
    const bad = checkAttachments(documents, me.id);
    if (bad) return { ok: false, message: bad };
    const { error } = await supabase.from("request_files").insert(
      documents.map((a) =>
        a.kind === "file"
          ? { request_id: id, purpose: "document", kind: "file", path: a.path, name: a.name, size_bytes: a.size_bytes }
          : { request_id: id, purpose: "document", kind: "link", url: a.url.trim(), name: a.name.trim() || a.url.trim() },
      ),
    );
    if (error) return { ok: false, message: `Gagal menyimpan dokumen: ${error.message}` };
  }

  return runStatus(id, to, note, to === "paid" ? paidOn : null, null);
}

export async function addRequestNote(id: string, note: string): Promise<SimpleResult> {
  if (!note.trim()) return { ok: false, message: "Catatan belum diisi." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_request_note", { p_id: id, p_note: note.trim() });
  if (error) return { ok: false, message: error.message };
  revalidateRequests(id);
  return { ok: true };
}

// Hapus draf yang belum pernah dikirim (beserta lampirannya di Storage).
export async function deleteDraft(id: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data: files } = await supabase.from("request_files").select("kind, path").eq("request_id", id);
  const { data, error } = await supabase.from("requests").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Hanya draf yang belum dikirim yang bisa dihapus." };
  const paths = (files ?? []).filter((f) => f.kind === "file" && f.path).map((f) => f.path as string);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  revalidateRequests();
  return { ok: true };
}
