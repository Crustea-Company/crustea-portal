// Ganti catatan "sedang dikembangkan" di prosedur dengan link ke formulir yang sudah jadi.
// node --env-file=.env.local scripts/perbarui-link-prosedur.mjs
import { createClient } from "@supabase/supabase-js";

const DEV = "> Formulir di aplikasi **sedang dikembangkan**. Sementara itu, ikuti langkah di bawah.";
const LINKS = {
  "Monitoring KPI": "> Buka **[Monitoring KPI](/kpi)**.",
  "Monitoring target kuartal": "> Buka **[Target kuartal](/kpi/target)**.",
  "Permohonan pengadaan": "> Ajukan lewat **[Form pengadaan](/pengajuan/pengadaan/baru)**, lalu pantau di **[Pengajuan saya](/pengajuan)**.",
  "Stock, supply, & demand teknologi": "> Buka **[Penjualan](/penjualan)**, **[Stok](/stok)**, dan **[Aset](/aset)**. Kode referral Anda ada di **[Profil](/profil)**.",
  "Permintaan pembayaran": "> Ajukan lewat **[Form permintaan pembayaran](/pengajuan/pembayaran/baru)**, lalu pantau di **[Pengajuan saya](/pengajuan)**.",
  "Penugasan perjalanan dinas": "> Ajukan lewat **[Form penugasan dinas](/pengajuan/dinas/baru)**, lalu pantau di **[Pengajuan saya](/pengajuan)**.",
  "Manajemen aset": "> Buka **[Aset](/aset)**.",
  "Klaim reimburse, komisi, cuti, lembur":
    "> Ajukan lewat **[Form klaim komisi](/pengajuan/komisi/baru)**. Master produk ada di **[Produk](/produk)**, kode referral Anda di **[Profil](/profil)**. Komisi diterima setelah Finance memastikan penjualan lunas.",
};

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from("procedures").select("id, title, body");
if (error) throw error;
for (const p of data) {
  const link = LINKS[p.title];
  if (!link) continue;
  let body = p.body.replaceAll(DEV, link);
  // Bukti hanya berupa link (keputusan 27 Okt 2026).
  body = body.replace("bukti nota (foto/PDF atau link)", "bukti nota (link, mis. Google Drive)");
  if (body === p.body) { console.log("tidak berubah -", p.title); continue; }
  const { error: e } = await sb.from("procedures").update({ body }).eq("id", p.id);
  if (e) throw e;
  console.log("diperbarui -", p.title);
}
