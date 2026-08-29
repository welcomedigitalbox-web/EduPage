import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Messenger AI CRM',
  description: 'Facebook Page Messenger AI assistant, lead tracking and ad economics',
};

const NAV = [
  { href: '/', label: 'ခြုံငုံ' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/followups', label: 'Follow-up' },
  { href: '/ads', label: 'Ads' },
  { href: '/settings', label: 'Settings' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="my">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-52 shrink-0 border-r border-edge bg-panel p-4">
            <div className="mb-6 text-sm font-semibold">Messenger AI CRM</div>
            <nav className="space-y-1">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href}
                  className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-edge hover:text-white">
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-x-hidden p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
