import { redirect } from 'next/navigation';
import { APP_URL, safeNext } from '@/lib/apps';

export const dynamic = 'force-dynamic';

// EduPage no longer has its own sign-in: all four apps share one, and the POS
// hosts it. Bookmarks and old links land here and get forwarded.
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const back = safeNext(next ?? null) ?? APP_URL.onlineorder;
  redirect(`${APP_URL.pos}/login?next=${encodeURIComponent(back)}`);
}
