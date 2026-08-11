'use client';

import { Pill } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@medicore/ui';
import { platformNavSections } from './platform-nav-config';

export function PlatformSidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 border-r border-border bg-background flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Pill className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Medicore</div>
            <div className="text-xs text-muted-foreground">Platform</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6">
        {platformNavSections.map((section) => (
          <div key={section.label} className="mb-8">
            <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
