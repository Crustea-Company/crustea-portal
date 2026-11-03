// Gambar ilustrasi di isi prosedur. Ditulis di isi prosedur sebagai baris tersendiri:
//   ![Keterangan gambar](/prosedur/gambar/app02-tambah)
// File-nya ada di folder panduan-gambar/ (bukan public/, supaya hanya bisa dibuka setelah login).

export const GUIDE_IMAGE_PREFIX = "/prosedur/gambar/";
export const GUIDE_IMAGE_NAME = /^[a-z0-9-]+$/;

const IMAGE_LINE = /^[ \t]*!\[[^\]]*\]\(\/prosedur\/gambar\/([a-z0-9-]+)\)[ \t]*$/gm;

// Nama gambar yang dipakai di isi prosedur.
export function guideImageNames(body: string): string[] {
  return [...body.matchAll(IMAGE_LINE)].map((m) => m[1]);
}

// Buang baris gambar dari isi: semuanya (keep tidak diisi), atau hanya yang file-nya belum ada.
export function stripGuideImages(body: string, keep?: Set<string>): string {
  return body.replace(IMAGE_LINE, (line, name: string) => (keep?.has(name) ? line : "")).replace(/\n{3,}/g, "\n\n");
}
