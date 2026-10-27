"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthCard from "@/components/AuthCard";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "link"
      ? "Link login tidak valid atau sudah kedaluwarsa. Silakan minta link baru."
      : searchParams.get("error") === "sesi"
        ? "Sesi login Anda sudah berakhir (lama tidak dipakai atau sudah 30 hari). Silakan login ulang."
        : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    // Kunci Supabase ditanam saat build. Kalau kosong (mis. build Docker tanpa build-arg),
    // tampilkan pesan, jangan macet di "Mengirim...".
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setSending(false);
      setError("Aplikasi belum tersambung ke database (pengaturan server belum lengkap). Hubungi admin/TechOps.");
      return;
    }

    let error: { status?: number; message: string } | null = null;
    try {
      const supabase = createClient();
      ({ error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      }));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : "Koneksi gagal. Periksa internet lalu coba lagi." };
    }

    setSending(false);
    if (error) {
      // Supabase membatasi pengiriman email: jeda per alamat email (hitungan detik)
      // dan batas total per jam untuk semua akun (pengirim bawaan Supabase sangat kecil).
      const seconds = error.message.match(/after (\d+) seconds?/)?.[1];
      setError(
        error.status !== 429
          ? `Gagal mengirim link: ${error.message}`
          : seconds
            ? `Link untuk email ini baru saja diminta. Tunggu ${seconds} detik lalu coba lagi.`
            : "Batas pengiriman email login per jam sudah tercapai (berlaku untuk semua akun). Coba lagi sekitar 1 jam lagi.",
      );
      return;
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center text-white">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-logo-lime/20 text-logo-lime">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="m5 12 5 5L20 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Cek email Anda</p>
        <p className="text-sm text-white/80">
          Link login sudah dikirim ke <strong className="text-white">{sentTo}</strong>. Buka email itu di perangkat yang
          sama, lalu klik link-nya.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-2 text-sm font-medium text-logo-lime underline underline-offset-4"
        >
          Pakai email lain
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-semibold text-white">
          Email
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/60"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Masukkan email"
            className="w-full rounded-xl border border-white/20 bg-white/10 py-3.5 pl-12 pr-4 text-base text-white outline-none placeholder:text-white/50 focus:border-logo-lime focus:ring-2 focus:ring-logo-lime/30"
          />
        </div>
        <p className="text-xs text-white/60">Tanpa kata sandi: kami kirim link masuk ke email Anda.</p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-2 text-sm text-red-100">{error}</p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="flex items-center justify-center gap-2 rounded-xl bg-logo-lime px-4 py-3.5 text-base font-bold tracking-wide text-brand-950 shadow-lg transition hover:brightness-95 disabled:opacity-60"
      >
        {sending ? "Mengirim..." : "Kirim link masuk"}
        {!sending && (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Selamat Datang" subtitle="Masuk untuk melanjutkan ke Portal Crustea">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
