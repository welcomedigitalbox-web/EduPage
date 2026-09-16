import { cookies } from 'next/headers';
import { normaliseLang, LANG_COOKIE } from '@/lib/session';
import { APP_URL } from '@/lib/apps';

export const dynamic = 'force-dynamic';

// Where someone lands who is signed in on the POS but whose role doesn't
// cover this app. Without a real page the redirect ends on a 404 and looks
// like the sign-in itself broke.
export default async function NoAccess() {
  const lang = normaliseLang((await cookies()).get(LANG_COOKIE)?.value);
  const my = lang !== 'en';

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold">
          {my ? 'ဝင်ရောက်ခွင့် မရှိပါ' : 'No access'}
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted">
          {my
            ? 'Online Order ကို ဝင်ရောက်ခွင့် မရှိပါ။ လိုအပ်ပါက HR သို့မဟုတ် admin ထံ ဆက်သွယ်ပါ။'
            : 'Your account does not have access to Online Order. Ask HR or an admin if you need it.'}
        </p>
        <a
          href={APP_URL.pos}
          className="inline-block rounded-lg border px-4 py-2 text-sm font-medium"
        >
          {my ? 'POS သို့ ပြန်သွားရန်' : 'Back to the POS'}
        </a>
      </div>
    </div>
  );
}
