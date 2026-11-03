"use client";

import { useState } from "react";

// Lebar gambar unduhan (px). Bagan dirender ulang selebar ini di luar layar, jadi hasilnya selalu
// berbentuk lebar seperti slide (container query di page.tsx), walau diunduh dari HP.
const EXPORT_WIDTH = 1600;
const PADDING = 40;

async function renderPng(targetId: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const source = document.getElementById(targetId);
  if (!source) throw new Error("Bagan tidak ditemukan.");

  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-${EXPORT_WIDTH * 2}px;top:0;width:${EXPORT_WIDTH}px;padding:${PADDING}px;background:#f8fafc;`;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(host, { width, height, pixelRatio: 2, backgroundColor: "#f8fafc", style: { left: "0", position: "static" } });
    return { dataUrl, width, height };
  } finally {
    host.remove();
  }
}

export default function OrgExport({ targetId, fileName }: { targetId: string; fileName: string }) {
  const [busy, setBusy] = useState<"" | "png" | "pdf">("");
  const [error, setError] = useState("");

  const run = async (kind: "png" | "pdf") => {
    setBusy(kind);
    setError("");
    try {
      const { dataUrl, width, height } = await renderPng(targetId);
      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${fileName}.png`;
        a.click();
      } else {
        // Satu halaman seukuran bagan.
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: width >= height ? "landscape" : "portrait", unit: "px", format: [width, height], hotfixes: ["px_scaling"] });
        pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
        pdf.save(`${fileName}.pdf`);
      }
    } catch (e) {
      setError(`Gagal mengunduh: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy("");
    }
  };

  const btn =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
  return (
    <>
      <button type="button" className={btn} disabled={!!busy} onClick={() => run("png")}>
        {busy === "png" ? "Menyiapkan..." : "Unduh PNG"}
      </button>
      <button type="button" className={btn} disabled={!!busy} onClick={() => run("pdf")}>
        {busy === "pdf" ? "Menyiapkan..." : "Unduh PDF"}
      </button>
      {error && <span className="text-sm text-red-700">{error}</span>}
    </>
  );
}
