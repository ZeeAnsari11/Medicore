'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pill } from 'lucide-react';
import { cn, can } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { navSections } from './nav-config';

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, permissions } = usePermissions();

  // Build subject roles: admin bypasses all permission checks
  const subjectRoles = isAdmin ? ['*'] : permissions;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Pill className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Medicore</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navSections
          .filter((section) => !section.requires || can(subjectRoles, section.requires))
          .map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items
                  .filter((item) => !item.requires || can(subjectRoles, item.requires))
                  .map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors',
                            isActive
                              ? 'bg-sidebar-accent text-white'
                              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white',
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <item.icon className="size-4" />
                            {item.label}
                          </span>
                          {item.comingSoon && (
                            <span className="rounded-full bg-sidebar-border px-1.5 py-0.5 text-[10px] font-medium text-sidebar-muted">
                              Soon
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
      </nav>
    </aside>
  );
}
