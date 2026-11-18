'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pill, ChevronRight } from 'lucide-react';
import { cn, can } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { navSections } from './nav-config';

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin, permissions } = usePermissions();

  // Build subject roles: admin bypasses all permission checks
  const subjectRoles = isAdmin ? ['*'] : permissions;

  return (
    <aside className="sticky top-0 left-0 h-screen w-64 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col overflow-hidden">
      {/* Logo Section */}
      <div className="px-6 py-6 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
            <Pill className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Medicore</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Workspace</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {navSections
          .filter((section) => !section.requires || can(subjectRoles, section.requires))
          // Hide group headings with no visible items
          .filter((section) => section.items.some((item) => can(subjectRoles, item.requires)))
          .map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items
                  .filter((item) => !item.requires || can(subjectRoles, item.requires))
                  // Accounting sub-pages are reached from the cards on the Accounting overview page
                  .filter((item) => !item.href.startsWith('/accounting/'))
                  .map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                          isActive
                            ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className={cn('w-5 h-5 transition-transform', isActive && 'text-blue-600 dark:text-blue-400')} />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <ChevronRight className="w-4 h-4" />}
                        {item.comingSoon && (
                          <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                            Soon
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
      </nav>

      {/* Footer Section */}
      <div className="px-4 py-4 border-t border-slate-200/50 dark:border-slate-800/50 space-y-3">
        <div className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/30">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">System Active</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">All systems operational</p>
        </div>
      </div>
    </aside>
  );
}
