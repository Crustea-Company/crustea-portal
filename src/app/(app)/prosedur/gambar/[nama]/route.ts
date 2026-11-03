import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { GUIDE_IMAGE_NAME } from "@/lib/procedure-images";
import { GUIDE_IMAGE_DIR } from "@/lib/procedure-images-server";

export const runtime = "nodejs";

// Gambar ilustrasi prosedur (panduan-gambar/<nama>.png), hanya untuk karyawan aktif yang login.
// Alamat tanpa ".png" supaya tetap melewati pemeriksaan login di middleware.
export async function GET(_req: Request, { params }: { params: Promise<{ nama: string }> }) {
  const { nama } = await params;
  if (!GUIDE_IMAGE_NAME.test(nama)) return new NextResponse("Tidak ditemukan.", { status: 404 });
  if (!(await getCurrentEmployee())) return new NextResponse("Akses ditolak.", { status: 403 });

  const file = await readFile(path.join(GUIDE_IMAGE_DIR, `${nama}.png`)).catch(() => null);
  if (!file) return new NextResponse("Tidak ditemukan.", { status: 404 });
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" },
  });
}
