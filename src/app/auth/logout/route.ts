import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";
import { SESSION_COOKIE } from "@/lib/session";

// Tombol "Keluar" mengirim formulir ke sini.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(`${requestOrigin(request)}/login`, {
    status: 303,
  });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
