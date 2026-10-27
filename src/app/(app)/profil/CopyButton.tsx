"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Salin kode ini:", text);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
    >
      {copied ? "Tersalin ✓" : "Salin kode"}
    </button>
  );
}
