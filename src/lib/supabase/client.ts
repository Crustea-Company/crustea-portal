import { createBrowserClient } from "@supabase/ssr";

// Koneksi Supabase untuk kode yang berjalan di browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
