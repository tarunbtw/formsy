import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { lucia } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.scryptSync(password, process.env.AUTH_SECRET!, 64).toString("hex");
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const hashed = hashPassword(password);
  if (hashed !== user.hashed_password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return NextResponse.json({ ok: true });
}