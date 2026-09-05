import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE, LANG_COOKIE, normaliseLang } from './session';
import { t as translate, type Lang } from './i18n';

/** Per-request language + signed-in user, for server components. */
export async function ctx() {
  const c = await cookies();
  const lang: Lang = normaliseLang(c.get(LANG_COOKIE)?.value);
  const session = await verifySession(c.get(SESSION_COOKIE)?.value);
  return {
    lang,
    session,
    t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
  };
}
