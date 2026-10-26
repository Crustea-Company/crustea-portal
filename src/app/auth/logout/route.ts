import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Tombol "Keluar" mengirim formulir ke sini.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login`, {
    status: 303,
  });
}
