import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ctx } from '@/lib/server-ctx';
import { LangToggle, SignOut } from '@/components/TopBar';

export const metadata: Metadata = {
  title: 'Messenger AI CRM',
  description: 'Facebook Page Messenger AI assistant, lead tracking and ad economics',
};

const NAV = [
  { href: '/', key: 'nav_overview', managerOnly: false },
  { href: '/inbox', key: 'nav_inbox', managerOnly: false },
  { href: '/customers', key: 'nav_customers', managerOnly: false },
  { href: '/followups', key: 'nav_followups', managerOnly: false },
  { href: '/reports', key: 'nav_reports', managerOnly: true },
  { href: '/ads', key: 'nav_ads', managerOnly: true },
  { href: '/insights', key: 'nav_insights', managerOnly: true },
  { href: '/usage', key: 'nav_usage', managerOnly: true },
  { href: '/settings', key: 'nav_settings', managerOnly: true },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, session, t } = await ctx();

  return (
    <html lang={lang === 'en' ? 'en' : 'my'}>
      <body>
        {session ? (
          <div className="flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r border-edge bg-panel p-4">
              <div className="mb-4 text-sm font-semibold">{t('app_name')}</div>
              <div className="mb-4"><LangToggle lang={lang} /></div>
              <nav className="flex-1 space-y-1">
                {NAV.filter((n) => !n.managerOnly || session.role === 'manager').map((n) => (
                  <Link key={n.href} href={n.href}
                    className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-edge hover:text-white">
                    {t(n.key)}
                  </Link>
                ))}
              </nav>
              <div className="border-t border-edge pt-2">
                <div className="truncate px-3 py-1 text-xs text-muted">
                  {session.name || session.email}
                  <span className="ml-1 opacity-70">
                    · {t(session.role === 'manager' ? 'us_role_manager' : 'us_role_agent')}
                  </span>
                </div>
                <SignOut label={t('sign_out')} />
              </div>
            </aside>
            <main className="flex-1 overflow-x-hidden p-6">{children}</main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
