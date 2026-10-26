"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "link"
      ? "Link login tidak valid atau sudah kedaluwarsa. Silakan minta link baru."
      : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

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
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
        <p className="font-semibold">Cek email Anda</p>
        <p className="mt-1">
          Link login sudah dikirim ke <strong>{sentTo}</strong>. Buka email itu
          di perangkat dan browser yang sama, lalu klik link-nya.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-3 font-medium text-teal-700 underline"
        >
          Pakai email lain
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium text-slate-700">
        Email kantor
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="nama@email.com"
        className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {sending ? "Mengirim..." : "Kirim link login"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <p className="text-sm font-medium text-teal-700">PT Eco Karya Teknologi</p>
        <h1 className="text-3xl font-bold text-slate-900">Crustea Portal</h1>
        <p className="mt-2 text-slate-600">
          Masukkan email Anda. Kami akan mengirim link untuk masuk, tanpa kata sandi.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
