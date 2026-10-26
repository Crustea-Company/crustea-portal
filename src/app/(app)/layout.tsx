import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import NavLinks from "@/components/NavLinks";
import NotificationBell from "@/components/NotificationBell";

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-teal-800">Crustea Portal</span>
            <NavLinks isAdmin={employee.app_role === "admin"} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">{employee.full_name}</span>
            <NotificationBell />
            <LogoutButton />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
