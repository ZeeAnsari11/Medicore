'use client';

import { Pill, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@medicore/ui';
import { platformNavSections } from './platform-nav-config';

export function PlatformSidebar({ open = true, onNavigate }: { open?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 h-dvh w-64 max-w-[85vw] transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:max-w-none md:shrink-0 md:translate-x-0 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 border-r border-slate-200/50 dark:border-slate-800/50 flex flex-col overflow-hidden',
        !open && '-translate-x-full',
      )}
    >
      {/* Logo Section */}
      <div className="px-6 py-6 border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
            <Pill className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white">Medicore</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Platform</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {platformNavSections.map((section) => (
          <div key={section.label} className="space-y-2">
            <h3 className="px-3 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">
              {section.label}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                      isActive
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn('w-5 h-5 transition-transform', isActive && 'text-blue-600 dark:text-blue-400')} />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Section */}
      <div className="px-4 py-4 border-t border-slate-200/50 dark:border-slate-800/50 space-y-3">
        <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">Pro Plan Active</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">All features unlocked</p>
        </div>
      </div>
    </aside>
  );
}
