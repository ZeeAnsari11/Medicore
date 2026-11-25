'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pill, ChevronUp, PanelLeft } from 'lucide-react';
import { cn, can } from '@medicore/ui';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter, hidesBranchFilter } from '@/components/branch-filter';
import { navSections } from './nav-config';

/** Sections with no heading: the single Dashboard link sits on its own above the groups. */
const HEADINGLESS_SECTION = 'Overview';

export function Sidebar({ open = true, onToggle }: { open?: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isAdmin, permissions } = usePermissions();
  const branchFilter = useBranchFilter();
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const toggle = (title: string) =>
    setCollapsed((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));

  // Build subject roles: admin bypasses all permission checks
  const subjectRoles = isAdmin ? ['*'] : permissions;

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  return (
    <aside
      inert={!open}
      className={cn(
        // Below md the sidebar is an off-canvas drawer over the page; from md up it sits in the flow.
        'fixed inset-y-0 left-0 z-50 h-dvh w-64 max-w-[85vw] transition-transform duration-200 md:static md:z-auto md:h-screen md:max-w-none md:shrink-0 md:transition-[margin] bg-slate-50 dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800 flex flex-col overflow-hidden',
        !open && '-translate-x-full md:translate-x-0 md:-ml-64',
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
          <Pill className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Medicore</h1>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide sidebar"
          className="ml-auto p-2 shrink-0 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <PanelLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      {/* The top bar drops its branch selector below md, so it sits here instead. */}
      {!hidesBranchFilter(pathname) && (
        <div className="px-4 pb-3 md:hidden [&_button]:!w-auto [&_button]:min-w-0 [&_button]:flex-1">
          <BranchFilter filter={branchFilter} viewing />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {navSections
          .filter((section) => !section.requires || can(subjectRoles, section.requires))
          // Hide group headings with no visible items
          .filter((section) => section.items.some((item) => can(subjectRoles, item.requires)))
          .map((section, index) => {
            const hasHeading = section.title !== HEADINGLESS_SECTION;
            const isOpen = !hasHeading || !collapsed.includes(section.title);
            return (
              <div
                key={section.title}
                className={cn(index > 0 && 'mt-2 pt-2', hasHeading && index > 0 && 'border-t border-slate-200 dark:border-slate-800')}
              >
                {hasHeading && (
                  <button
                    type="button"
                    onClick={() => toggle(section.title)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <span>{section.title}</span>
                    <ChevronUp className={cn('w-4 h-4 transition-transform', !isOpen && 'rotate-180')} />
                  </button>
                )}
                <div className={cn('space-y-0.5', !isOpen && 'hidden')}>
                  {section.items
                    .filter((item) => !item.requires || can(subjectRoles, item.requires))
                    .map((item) => {
                      // The Accounting overview owns /accounting only; its pages highlight themselves.
                      const isActive =
                        item.href === '/accounting'
                          ? pathname === item.href
                          : pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => {
                            if (window.matchMedia('(max-width: 767px)').matches) onToggle();
                          }}
                          className={cn(
                            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200',
                          )}
                        >
                          <item.icon className="w-5 h-5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.comingSoon && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                              Soon
                            </span>
                          )}
                        </Link>
                      );
                    })}
                </div>
              </div>
            );
          })}
      </nav>

      {/* Signed-in user */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2.5">
          <div className="w-9 h-9 shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.username}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.tenantRole ?? ''}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
