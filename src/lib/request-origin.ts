import type { NextRequest } from "next/server";

// Alamat yang benar-benar dibuka pengguna (mis. http://192.168.1.185:3000 dari HP).
// request.nextUrl.origin di route handler bisa berisi "localhost" walaupun dibuka
// lewat alamat lain, sehingga pengalihan nyasar ke localhost di HP.
export function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
