'use client';

import { useEffect, useState } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial state
    const stored = localStorage.getItem('theme');
    const prefersDark =
      stored === 'dark' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches);

    setIsDark(prefersDark);
  }, []);

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const newValue = !prev;
      localStorage.setItem('theme', newValue ? 'dark' : 'light');

      if (newValue) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      return newValue;
    });
  };

  return { isDark, toggleDarkMode };
}
