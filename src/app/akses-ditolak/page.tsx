import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import AuthCard from "@/components/AuthCard";

export default async function AccessDeniedPage() {
  // Karyawan aktif tidak perlu melihat halaman ini.
  if (await getCurrentEmployee()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthCard title="Akses ditolak" subtitle="Email ini belum terdaftar sebagai karyawan aktif">
      <div className="flex flex-col gap-5 text-center text-sm text-white/80">
        <p>
          Anda masuk sebagai <strong className="text-white">{user?.email ?? "-"}</strong>. Crustea Portal hanya bisa
          dipakai oleh karyawan aktif PT Eco Karya Teknologi. Kalau menurut Anda ini keliru, hubungi Corporate Affairs.
        </p>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 font-semibold text-white hover:bg-white/20"
          >
            Keluar dan pakai email lain
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
