import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  checkSession,
  sessionSecretConfigured,
  signSession,
  type JwtClaims,
} from "@/lib/session";

// Halaman yang boleh dibuka tanpa login.
const PUBLIC_PATHS = ["/login", "/auth"];

let warnedSecret = false;

// Dijalankan di setiap permintaan (halaman, server action, unduhan):
// 1. JWT Supabase di cookie diverifikasi (tanda tangan + masa berlaku); diperbarui otomatis bila hampir habis.
// 2. Cookie sesi aplikasi dicek: terikat ke JWT, belum lewat batas tidak aktif / umur maksimal.
// Gagal salah satunya = dianggap belum login (sesi Supabase di perangkat ini ikut diakhiri).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );

  const { data } = await supabase.auth.getClaims();
  const claims = (data?.claims ?? null) as JwtClaims | null;
  let loggedIn = !!claims?.sub;
  let sessionEnded = false;

  if (loggedIn && !isPublic) {
    if (!sessionSecretConfigured()) {
      if (!warnedSecret) {
        console.error("SESSION_SECRET belum diisi (minimal 32 karakter): pengecekan sesi aplikasi dilewati.");
        warnedSecret = true;
      }
    } else {
      const check = await checkSession(request.cookies.get(SESSION_COOKIE)?.value, claims!);
      if (!check.ok) {
        await supabase.auth.signOut({ scope: "local" });
        response.cookies.delete(SESSION_COOKIE);
        loggedIn = false;
        sessionEnded = true;
      } else if (check.refreshed) {
        response.cookies.set(SESSION_COOKIE, await signSession(check.refreshed), SESSION_COOKIE_OPTIONS);
      }
    }
  }

  // Bawa cookie yang sudah diatur (sesi diperbarui / dihapus) ke respons pengalihan.
  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // Kalau Supabase memakai alamat cadangan (Site URL), kode login mendarat di halaman
  // awal (/?code=...). Teruskan ke penerima link supaya login tetap berhasil.
  const code = request.nextUrl.searchParams.get("code");
  if (!loggedIn && code && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}`;
    return redirect(url);
  }

  if (!loggedIn && !isPublic) {
    // Server action / permintaan data (bukan membuka halaman): tolak dengan 401, jangan dialihkan.
    if (request.method !== "GET" || request.headers.has("next-action")) {
      const r = NextResponse.json({ error: "Sesi login tidak valid atau sudah berakhir. Silakan login ulang." }, { status: 401 });
      response.cookies.getAll().forEach((c) => r.cookies.set(c));
      return r;
    }
    const url = request.nextUrl.clone();
    // Supabase mengembalikan pengguna ke sini dengan ?error=... kalau link login
    // tidak valid / kedaluwarsa / alamatnya belum diizinkan: tampilkan pesannya di login.
    const linkFailed =
      request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("error_code");
    url.pathname = "/login";
    url.search = linkFailed ? "?error=link" : sessionEnded ? "?error=sesi" : "";
    return redirect(url);
  }

  if (loggedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Lewati file statis (gambar, ikon, file build Next.js) dan file PWA
    // (manifest, service worker, halaman offline) yang harus bisa dibuka tanpa login.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
