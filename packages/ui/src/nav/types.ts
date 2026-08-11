import type { LucideIcon } from 'lucide-react';

export interface NavVisibilityRequirement {
  anyOf?: string[];
}

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  requires?: NavVisibilityRequirement;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  requires?: NavVisibilityRequirement;
}
