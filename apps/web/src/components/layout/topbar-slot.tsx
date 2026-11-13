'use client';

import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

interface TopbarSlotValue {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
  actionsEl: HTMLElement | null;
  setActionsEl: (el: HTMLElement | null) => void;
}

const TopbarSlotContext = createContext<TopbarSlotValue | null>(null);

export function TopbarSlotProvider({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  return (
    <TopbarSlotContext.Provider value={{ el, setEl, actionsEl, setActionsEl }}>
      {children}
    </TopbarSlotContext.Provider>
  );
}

/** True inside the app shell, where a top bar exists to receive page titles and actions. */
export function useHasTopbarSlot() {
  return useContext(TopbarSlotContext) !== null;
}

/** The top bar's title area. Pages fill it with `<TopbarContent>`; while it is empty the bar shows its default title. */
export function TopbarSlotTarget({ className }: { className?: string }) {
  const ctx = useContext(TopbarSlotContext);
  return <div ref={ctx?.setEl} className={className} />;
}

/** Renders its children in the top bar's title area instead of in the page body. */
export function TopbarContent({ children }: { children: React.ReactNode }) {
  const el = useContext(TopbarSlotContext)?.el;
  return el ? createPortal(children, el) : null;
}

/** The top bar's page-actions area, left of the dark-mode toggle. */
export function TopbarActionsTarget({ className }: { className?: string }) {
  const ctx = useContext(TopbarSlotContext);
  return <div ref={ctx?.setActionsEl} className={className} />;
}

/** Renders its children in the top bar's actions area instead of in the page body. */
export function TopbarActionsContent({ children }: { children: React.ReactNode }) {
  const el = useContext(TopbarSlotContext)?.actionsEl;
  return el ? createPortal(children, el) : null;
}
