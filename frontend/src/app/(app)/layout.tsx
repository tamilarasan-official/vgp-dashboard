import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api';
import { NavLinks } from './nav-links';
import { ThemeToggle } from '@/components/theme-toggle';

const ALL_LINKS = [
  { href: '/', label: 'Overview', roles: ['admin', 'viewer'] },
  { href: '/velocity', label: 'Velocity', roles: ['admin', 'viewer'] },
  { href: '/crm', label: 'Leads & Calls', roles: ['admin', 'viewer'] },
  { href: '/hr', label: 'HR & Attendance', roles: ['admin', 'viewer'] },
  { href: '/tally', label: 'Accounts (Tally)', roles: ['admin', 'viewer', 'tally_uploader'] },
  { href: '/feedback', label: 'Customer Feedback', roles: ['admin', 'viewer', 'feedback_uploader'] },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  viewer: 'Management',
  tally_uploader: 'Accounts team',
  feedback_uploader: 'Feedback team',
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const links = ALL_LINKS.filter((l) => l.roles.includes(me.role));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">V</div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">VGP Executive Dashboard</div>
              <div className="text-xs text-muted">VGP Wonder World group</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block">{me.name}</span>
              <span className="block text-xs text-muted">{ROLE_LABEL[me.role] ?? me.role}</span>
            </span>
            <ThemeToggle />
            <a href="/logout" className="rounded border border-line px-3 py-1 hover:bg-subtle">Sign out</a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <NavLinks links={links.map(({ href, label }) => ({ href, label }))} />
        </div>
      </header>
      {children}
    </div>
  );
}
