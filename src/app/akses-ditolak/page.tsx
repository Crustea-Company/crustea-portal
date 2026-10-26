import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

export default async function AccessDeniedPage() {
  // Karyawan aktif tidak perlu melihat halaman ini.
  if (await getCurrentEmployee()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div>
        <p className="text-sm font-medium text-red-700">Akses ditolak</p>
        <h1 className="text-2xl font-bold text-slate-900">
          Email ini belum terdaftar sebagai karyawan aktif
        </h1>
      </div>
      <p className="text-slate-600">
        Anda masuk sebagai <strong>{user?.email ?? "-"}</strong>. Crustea Portal
        hanya bisa dipakai oleh karyawan aktif PT Eco Karya Teknologi. Kalau
        menurut Anda ini keliru, hubungi Corporate Affairs.
      </p>
      <div>
        <LogoutButton />
      </div>
    </main>
  );
}
