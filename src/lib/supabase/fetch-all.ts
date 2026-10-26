// Database membatasi 1.000 baris per permintaan; fungsi ini mengambil semua halaman.
// `build` harus membuat query baru setiap kali dipanggil.
export async function fetchAll<T>(
  build: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}
