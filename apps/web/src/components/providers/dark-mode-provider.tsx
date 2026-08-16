'use client';

import { useEffect } from 'react';

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Check localStorage and system preference
    const stored = localStorage.getItem('theme');
    const prefersDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (prefersDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return children;
}
