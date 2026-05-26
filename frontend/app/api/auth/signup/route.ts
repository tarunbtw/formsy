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

  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const hashed = hashPassword(password);

  try {
    await pool.query(
      `INSERT INTO users (id, email, hashed_password) VALUES ($1, $2, $3)`,
      [id, email.toLowerCase().trim(), hashed]
    );
  } catch {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const session = await lucia.createSession(id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return NextResponse.json({ ok: true });
}