// Sesi login aplikasi (di atas sesi Supabase). Dipakai middleware dan halaman login.
//
// Selain JWT Supabase (diverifikasi di setiap permintaan), aplikasi menyimpan cookie sesi sendiri
// yang ditandatangani (HMAC-SHA256, kunci SESSION_SECRET) dan terikat ke session_id JWT:
//   - tidak dipakai lebih dari IDLE_TIMEOUT_MS  -> harus login ulang;
//   - umur login lebih dari MAX_SESSION_MS       -> harus login ulang (dihitung dari waktu login di JWT,
//     jadi tidak bisa diperpanjang dengan menghapus cookie).
// Kode ini berjalan di middleware (Edge runtime): hanya memakai Web Crypto.

export const SESSION_COOKIE = "crustea_sesi";
export const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari tidak dipakai
export const MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari sejak login
// Waktu "terakhir aktif" diperbarui paling sering sekali per menit (mengurangi tulis cookie).
const TOUCH_EVERY_MS = 60 * 1000;

export type SessionPayload = {
  sub: string; // id pengguna Supabase
  sid: string; // session_id di JWT
  login: number; // waktu login (ms)
  seen: number; // terakhir aktif (ms)
};

export type JwtClaims = { sub?: string; session_id?: string; iat?: number; amr?: { method: string; timestamp: number }[] };

const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

export function sessionSecretConfigured(): boolean {
  return (process.env.SESSION_SECRET ?? "").length >= 32;
}

function key(): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    enc.encode(process.env.SESSION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function signSession(p: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

async function readSession(value: string | undefined): Promise<SessionPayload | null> {
  if (!value) return null;
  const [body, sig] = value.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    return typeof p.sub === "string" && typeof p.sid === "string" && Number.isFinite(p.login) && Number.isFinite(p.seen) ? p : null;
  } catch {
    return null;
  }
}

// Waktu login menurut JWT (ditandatangani Supabase): stempel waktu metode login (magic link).
export function loginTime(claims: JwtClaims): number {
  const t = Math.max(0, ...(claims.amr ?? []).map((a) => a.timestamp).filter(Number.isFinite));
  return (t || claims.iat || 0) * 1000;
}

// Sesi baru untuk JWT yang baru saja login (dipanggil setelah link login ditukar).
export function newSession(claims: JwtClaims, now = Date.now()): SessionPayload | null {
  if (!claims.sub || !claims.session_id) return null;
  return { sub: claims.sub, sid: claims.session_id, login: loginTime(claims) || now, seen: now };
}

export type SessionCheck =
  | { ok: true; refreshed: SessionPayload | null } // refreshed: cookie perlu ditulis ulang
  | { ok: false; reason: "missing" | "mismatch" | "idle" | "expired" };

// Cocokkan cookie sesi aplikasi dengan JWT yang sudah diverifikasi.
export async function checkSession(cookie: string | undefined, claims: JwtClaims, now = Date.now()): Promise<SessionCheck> {
  const s = await readSession(cookie);
  if (!s) return { ok: false, reason: "missing" };
  if (s.sub !== claims.sub || s.sid !== claims.session_id) return { ok: false, reason: "mismatch" };
  if (now - Math.min(s.login, loginTime(claims) || s.login) > MAX_SESSION_MS) return { ok: false, reason: "expired" };
  if (now - s.seen > IDLE_TIMEOUT_MS) return { ok: false, reason: "idle" };
  return { ok: true, refreshed: now - s.seen > TOUCH_EVERY_MS ? { ...s, seen: now } : null };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_SESSION_MS / 1000,
};
