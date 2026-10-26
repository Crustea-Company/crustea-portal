import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import NavLinks from "@/components/NavLinks";
import NotificationBell from "@/components/NotificationBell";
import StickyHeader from "@/components/StickyHeader";

// Semua halaman di dalam folder (app) hanya untuk karyawan aktif.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/akses-ditolak");

  return (
    <div className="min-h-screen">
      {/* HP: baris 1 = nama aplikasi + lonceng + keluar, baris 2 = menu (bisa digeser).
          Layar lebar: semuanya satu baris. */}
      <StickyHeader>
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:flex sm:py-3">
          <span className="order-1 font-bold text-brand-800">Crustea Portal</span>
          <div className="order-3 col-span-2 min-w-0 sm:order-2">
            <NavLinks isAdmin={employee.app_role === "admin"} />
          </div>
          <div className="order-2 flex items-center gap-3 text-sm sm:order-3 sm:ml-auto">
            <span className="hidden text-slate-600 lg:inline">{employee.full_name}</span>
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </StickyHeader>
      {children}
    </div>
  );
}
