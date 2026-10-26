"use client";

import { useEffect } from "react";

// Mendaftarkan service worker (public/sw.js) supaya aplikasi bisa di-install di HP.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Gagal daftar (mis. alamat bukan https): aplikasi tetap berjalan normal.
      });
    }
  }, []);
  return null;
}
