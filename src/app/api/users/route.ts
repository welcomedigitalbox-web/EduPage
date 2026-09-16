import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { msgrStaff } from '@/lib/staff';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { APP_URL } from '@/lib/apps';

export const runtime = 'nodejs';

async function requireManager() {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  return s?.role === 'manager' ? s : null;
}

export async function GET() {
  if (!(await requireManager())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ users: await msgrStaff() });
}

// Creating staff moved to the POS, which owns the employee record. Answering
// here instead of quietly 404-ing tells anyone still calling this where to go.
export async function POST() {
  return NextResponse.json(
    { error: 'managed_on_pos', where: `${APP_URL.pos}/admin/users` },
    { status: 410 }
  );
}
