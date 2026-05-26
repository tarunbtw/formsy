import { NextResponse } from "next/server";
import { lucia } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST() {
  const { session } = await getSession();
  if (session) await lucia.invalidateSession(session.id);

  const sessionCookie = lucia.createBlankSessionCookie();
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return NextResponse.json({ ok: true });
}