"use client";

import { createClient } from "@/lib/supabase/client";
import { BUCKET, MAX_FILE_BYTES } from "@/lib/requests";

// Kode acak. crypto.randomUUID hanya ada di https/localhost; saat dibuka dari HP
// lewat alamat IP laptop (http://192.168...) fungsi itu tidak tersedia.
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

const MAX_SIDE = 1600; // piksel sisi terpanjang setelah dikompres
const QUALITY = 0.8;

// Foto dari kamera HP biasanya 3-8 MB: perkecil jadi JPEG ±1600 px sebelum diunggah.
// PDF dan gambar yang tidak bisa dibaca browser (mis. HEIC) dikirim apa adanya.
export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // latar putih untuk PNG transparan
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Unggah ke folder milik sendiri: <id karyawan>/<acak>/<nama file>.
export async function uploadRequestFile(
  file: File,
  employeeId: string,
): Promise<{ ok: true; path: string; name: string; size_bytes: number } | { ok: false; message: string }> {
  const ready = await compressImage(file);
  if (ready.size > MAX_FILE_BYTES) {
    return { ok: false, message: `${file.name} lebih dari 5 MB. Perkecil dulu atau kirim sebagai link.` };
  }
  const safe = ready.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const path = `${employeeId}/${randomId()}/${safe}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, ready, { contentType: ready.type || undefined });
  if (error) return { ok: false, message: `Gagal mengunggah ${file.name}: ${error.message}` };
  return { ok: true, path, name: ready.name, size_bytes: ready.size };
}
