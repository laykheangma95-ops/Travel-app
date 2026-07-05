import { NextResponse } from 'next/server';

// Verifies admin access: the email must match the ADMIN_EMAIL env variable.
// In demo mode (no ADMIN_EMAIL set) access is granted so the panel can be
// explored before configuration.
export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ ok: true, demo: true });
  }
  const ok = Boolean(email) && email!.trim().toLowerCase() === adminEmail.trim().toLowerCase();
  return NextResponse.json({ ok, demo: false }, { status: ok ? 200 : 403 });
}
