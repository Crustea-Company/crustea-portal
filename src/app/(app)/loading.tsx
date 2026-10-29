// Kerangka halaman yang langsung tampil saat pindah menu, sementara data dimuat dari database.
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6" aria-busy="true" aria-label="Memuat halaman">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
      <p className="text-center text-xs text-slate-400">Memuat...</p>
    </main>
  );
}
