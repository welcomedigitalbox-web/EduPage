import './globals.css';
import type { Metadata } from 'next';
import { ctx } from '@/lib/server-ctx';
import { LangToggle, SignOut } from '@/components/TopBar';
import { Shell } from '@/components/Shell';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // The dashboard is used one-handed on a phone; let people zoom a dense table.
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Messenger AI CRM',
  description: 'Facebook Page Messenger AI assistant, lead tracking and ad economics',
};

const NAV = [
  { href: '/', key: 'nav_overview', managerOnly: false },
  { href: '/inbox', key: 'nav_inbox', managerOnly: false },
  { href: '/customers', key: 'nav_customers', managerOnly: false },
  { href: '/followups', key: 'nav_followups', managerOnly: false },
  { href: '/ask', key: 'nav_ask', managerOnly: true },
  { href: '/reports', key: 'nav_reports', managerOnly: true },
  { href: '/ads', key: 'nav_ads', managerOnly: true },
  { href: '/insights', key: 'nav_insights', managerOnly: true },
  { href: '/usage', key: 'nav_usage', managerOnly: true },
  { href: '/settings', key: 'nav_settings', managerOnly: true },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, session, t } = await ctx();

  const nav = NAV
    .filter((n) => !n.managerOnly || session?.role === 'manager')
    .map((n) => ({
      href: n.href === '/inbox' ? '/inbox?filter=unanswered' : n.href,
      label: t(n.key),
    }));

  return (
    <html lang={lang === 'en' ? 'en' : 'my'}>
      <body>
        {session ? (
          <Shell
            nav={nav}
            appName={t('app_name')}
            user={session.name || session.email}
            role={t(session.role === 'manager' ? 'us_role_manager' : 'us_role_agent')}
            langToggle={<LangToggle lang={lang} />}
            signOut={<SignOut label={t('sign_out')} />}
          >
            {children}
          </Shell>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
