import { createClient } from "@supabase/supabase-js";

// Koneksi Supabase dengan kunci server (SUPABASE_SECRET_KEY). HANYA untuk kode server
// (jangan diimpor dari komponen "use client"). Saat ini dipakai halaman investor untuk
// memanggil fungsi investor_dashboard(), yang sengaja tidak bisa dipanggil dari browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
