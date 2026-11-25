'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto text-sm">
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 ${active ? 'border-accent font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
