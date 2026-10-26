import Image from "next/image";

// Latar gradasi + kartu transparan untuk halaman sebelum masuk (login, akses ditolak).
export default function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-950 px-4 py-10">
      {/* Cahaya lembut di latar */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-700/40 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-brand-500/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-logo-leaf/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-xl sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-24 items-center justify-center rounded-full border border-white/15 bg-white/10">
          <Image src="/brand/crustea-logo.png" alt="Crustea" width={30} height={40} className="h-9 w-auto" priority />
        </div>
        <h1 className="text-center text-3xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-center text-white/75">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/40">PT Eco Karya Teknologi</p>
    </main>
  );
}
