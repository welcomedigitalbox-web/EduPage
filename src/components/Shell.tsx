'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { InboxBadge } from './NavBadge';

export interface NavItem { href: string; label: string }

/**
 * On a phone the sidebar becomes a drawer behind a menu button. The nav is
 * rendered once and shown two ways, so a link never exists in one place and
 * not the other.
 */
export function Shell({
  nav, appName, user, role, langToggle, signOut, children,
}: {
  nav: NavItem[];
  appName: string;
  user: string;
  role: string;
  langToggle: React.ReactNode;
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating should close the drawer — otherwise it covers the page you just
  // asked for.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const links = (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      {nav.map((n) => {
        const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href.split('?')[0]);
        return (
          <Link key={n.href} href={n.href}
            className={`flex items-center rounded-lg px-3 py-2.5 text-sm ${
              active ? 'bg-edge text-white' : 'text-muted hover:bg-edge hover:text-white'
            }`}>
            {n.label}
            {n.href.startsWith('/inbox') && <InboxBadge />}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-edge pt-2">
      <div className="truncate px-3 py-1 text-xs text-muted">
        {user}<span className="ml-1 opacity-70">· {role}</span>
      </div>
      {signOut}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* phone header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-edge bg-panel px-4 py-3 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="rounded-lg border border-edge p-2 leading-none text-muted hover:text-white">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-sm font-semibold">{appName}</span>
        <span className="ml-auto flex items-center gap-2">
          <Link href="/inbox?filter=unanswered" className="relative flex items-center text-sm text-muted">
            <InboxBadge />
          </Link>
          {langToggle}
        </span>
      </header>

      {/* drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/60" />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-edge bg-panel p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold">{appName}</span>
              <button onClick={() => setOpen(false)}
                className="rounded-lg border border-edge px-2 py-1 text-xs text-muted">✕</button>
            </div>
            <div className="mb-4">{langToggle}</div>
            {links}
            {footer}
          </aside>
        </div>
      )}

      {/* desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-edge bg-panel p-4 lg:flex">
        <div className="mb-4 text-sm font-semibold">{appName}</div>
        <div className="mb-4">{langToggle}</div>
        {links}
        {footer}
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
    </div>
  );
}
