'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut, User, Moon, Sun, Settings, PanelLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useDarkMode } from '@/hooks/use-dark-mode';
import { useBranchFilter } from '@/hooks/use-branch-filter';
import { BranchFilter } from '@/components/branch-filter';
import { navSections } from './nav-config';
import { TopbarActionsTarget, TopbarSlotTarget } from './topbar-slot';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@medicore/ui';

interface TopbarProps {
  sidebarOpen: boolean;
  onShowSidebar: () => void;
}

export function Topbar({ sidebarOpen, onShowSidebar }: TopbarProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, toggleDarkMode } = useDarkMode();
  const branchFilter = useBranchFilter();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  // Longest matching nav href wins, so /sales/new still reads as "Sales" when no page fills the slot.
  const defaultTitle =
    navSections
      .flatMap((section) => section.items)
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? 'Medicore';

  // Create/edit document screens have their own Branch field; the viewing filter has no role there.
  const hideBranchFilter = /^\/(purchases|sales)\/(new|[^/]+\/edit)$/.test(pathname);

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??';

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/50 dark:border-slate-800/50">
      <div className="px-8 h-16 flex items-center justify-between">
        {/* Left: page-provided title (TopbarContent) or the default route title */}
        <div className="flex min-w-0 flex-1 items-center pr-4">
          {/* The hide button lives in the sidebar header; this one only appears once the sidebar is hidden. */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={onShowSidebar}
              aria-label="Show sidebar"
              className="mr-3 p-2 shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <PanelLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          )}
          <TopbarSlotTarget className="peer flex min-w-0 items-center gap-3" />
          <h2 className="text-xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent peer-[:not(:empty)]:hidden">
            {defaultTitle}
          </h2>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {!hideBranchFilter && <BranchFilter filter={branchFilter} viewing />}

          {/* Page actions (PageHeader) */}
          <TopbarActionsTarget className="mr-2 flex items-center gap-2" />

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-amber-500" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                  {initials}
                </div>
                {/* On the full-width document forms the bar is crowded; keep just the avatar below 2xl. */}
                <div className={cn('hidden text-left', hideBranchFilter ? '2xl:block' : 'sm:block')}>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {user?.username}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{user?.tenantRole ?? ''}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-semibold">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/settings')} className="cursor-pointer">
                <Settings className="w-4 h-4 mr-2" />
                <span>Account Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleLogout}
                className="text-red-600 dark:text-red-400 cursor-pointer focus:text-red-600 dark:focus:text-red-400"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span>Sign Out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
