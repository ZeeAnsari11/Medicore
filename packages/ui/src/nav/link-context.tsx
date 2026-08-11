'use client';

import { createContext, useContext } from 'react';

export type LinkComponent = React.ComponentType<React.AnchorHTMLAttributes<HTMLAnchorElement>>;

export const LinkContext = createContext<LinkComponent | undefined>(undefined);

export function useLinkContext(): LinkComponent {
  const LinkComponent = useContext(LinkContext);

  if (!LinkComponent) {
    return ({ ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />;
  }

  return LinkComponent;
}

export const LinkProvider: React.ComponentType<{ children: React.ReactNode; value: LinkComponent }> = ({
  children,
  value,
}) => <LinkContext.Provider value={value}>{children}</LinkContext.Provider>;
