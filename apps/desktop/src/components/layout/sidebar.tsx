import { Link, useLocation } from 'react-router-dom';
import { Pill } from 'lucide-react';
import { cn } from '@medicore/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { navSections } from './nav-config';

export function Sidebar() {
  const location = useLocation();
  const { isAdmin, permissions } = usePermissions();

  // permissions = allowedModules from user's role (e.g., ['vendors', 'products'])
  // isAdmin = true for TENANT_SUPER_ADMIN (show everything)

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
          .map((section) => {
            // For admin users, show everything
            if (isAdmin) {
              return (
                <div key={section.title}>
                  <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                    {section.title}
                  </p>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
                      return (
                        <li key={item.href}>
                          <Link
                            to={item.href}
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
              );
            }

            // For non-admin users, filter by allowed modules
            if (!isAdmin && section.title === 'Administration') {
              return null; // Hide administration section for non-admins
            }

            const visibleItems = section.items.filter((item) => {
              // Extract module ID from href (e.g., '/vendors' -> 'vendors')
              const moduleId = item.href.split('/')[1];
              return permissions.includes(moduleId);
            });

            if (visibleItems.length === 0) {
              return null; // Hide section if no items are visible
            }

            return (
              <div key={section.title}>
                <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">
                  {section.title}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link
                          to={item.href}
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
            );
          })
          .filter(Boolean)}
      </nav>
    </aside>
  );
}
