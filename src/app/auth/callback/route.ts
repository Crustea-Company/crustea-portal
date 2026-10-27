import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, newSession, sessionSecretConfigured, signSession, type JwtClaims } from "@/lib/session";

// Tujuan link di email login. Menukar kode dari link dengan sesi login,
// lalu membuat cookie sesi aplikasi (lihat src/lib/session.ts).
export async function GET(request: NextRequest) {
  const origin = requestOrigin(request);
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}/`);
      if (sessionSecretConfigured()) {
        const { data } = await supabase.auth.getClaims();
        const session = data?.claims ? newSession(data.claims as JwtClaims) : null;
        if (!session) {
          await supabase.auth.signOut({ scope: "local" });
          return NextResponse.redirect(`${origin}/login?error=link`);
        }
        response.cookies.set(SESSION_COOKIE, await signSession(session), SESSION_COOKIE_OPTIONS);
      }
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
