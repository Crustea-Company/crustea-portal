import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import AppShell from "@/components/AppShell";

// Semua halaman di dalam folder (app) hanya untuk karyawan aktif.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/akses-ditolak");

  return (
    <AppShell fullName={employee.full_name} role={employee.app_role} isAdmin={employee.app_role === "admin"}>
      {children}
    </AppShell>
  );
}
