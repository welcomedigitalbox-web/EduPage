import { cookies } from 'next/headers';
import { normaliseLang, LANG_COOKIE } from '@/lib/session';
import { t } from '@/lib/i18n';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login() {
  const lang = normaliseLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">{t(lang, 'login_title')}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{t(lang, 'login_sub')}</p>
        <LoginForm
          labels={{
            email: t(lang, 'login_email'),
            password: t(lang, 'login_password'),
            button: t(lang, 'login_button'),
            failed: t(lang, 'login_failed'),
            noProfile: t(lang, 'login_no_profile'),
          }}
        />
      </div>
    </div>
  );
}
